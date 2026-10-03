<?php
// Leads, their activity log, and stage history.

declare(strict_types=1);

const LEAD_TEXT_FIELDS = [
    'name' => 160,
    'title' => 160,
    'company' => 160,
    'email' => 190,
    'phone' => 60,
    'source' => 60,
    'owner' => 100,
    'notes' => 5000,
];
const MAX_IMPORT = 2000;

/** Validate incoming lead fields and map them to column names. */
function clean_lead_input(array $in, bool $partial): array
{
    $out = [];
    foreach (LEAD_TEXT_FIELDS as $field => $max) {
        if (!array_key_exists($field, $in)) continue;
        $v = $in[$field] ?? '';
        if (!is_string($v)) fail(422, "The $field must be text.", $field);
        $v = trim($v);
        if (text_len($v) > $max) fail(422, "The $field is too long.", $field);
        $out[$field] = $v;
    }
    if (array_key_exists('value', $in)) {
        $v = $in['value'];
        if ($v === '' || $v === null) $v = 0;
        if (!is_numeric($v) || $v < 0 || $v > 1e12) fail(422, 'Enter a positive number for the deal value.', 'value');
        $out['value'] = (int) round((float) $v);
    }
    if (array_key_exists('stage', $in)) {
        if (!is_string($in['stage']) || !isset(STAGES[$in['stage']])) fail(422, 'That stage doesn’t exist.', 'stage');
        $out['stage'] = $in['stage'];
    }
    if (array_key_exists('nextFollowUp', $in)) {
        $v = $in['nextFollowUp'];
        if ($v === '' || $v === null) {
            $out['next_follow_up'] = null;
        } elseif (is_string($v) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            $out['next_follow_up'] = $v;
        } else {
            fail(422, 'The follow-up must be a date.', 'nextFollowUp');
        }
    }
    foreach (['name' => 'Enter the contact’s name.', 'company' => 'Enter the company name.'] as $field => $message) {
        if ((!$partial && ($out[$field] ?? '') === '') || ($partial && array_key_exists($field, $out) && $out[$field] === '')) {
            fail(422, $message, $field);
        }
    }
    if (($out['email'] ?? '') !== '' && !filter_var($out['email'], FILTER_VALIDATE_EMAIL)) {
        fail(422, 'Enter an email like name@company.com.', 'email');
    }
    return $out;
}

function shape_lead(array $r): array
{
    return [
        'id' => $r['id'],
        'name' => $r['name'],
        'title' => $r['title'],
        'company' => $r['company'],
        'email' => $r['email'],
        'phone' => $r['phone'],
        'source' => $r['source'],
        'owner' => $r['owner'],
        'stage' => $r['stage'],
        'value' => (int) $r['value'],
        'notes' => $r['notes'],
        'nextFollowUp' => $r['next_follow_up'],
        'createdAt' => to_iso($r['created_at']),
        'updatedAt' => to_iso($r['updated_at']),
        'stageChangedAt' => to_iso($r['stage_changed_at']),
        'closedAt' => to_iso($r['closed_at']),
        'lastContactAt' => to_iso($r['last_contact_at']),
        'history' => [],
        'activities' => [],
    ];
}

/** Load live leads (all, or the given ids) with their history and activities. */
function load_leads(?array $ids = null): array
{
    $pdo = db();
    $where = 'l.deleted_at IS NULL';
    $params = [];
    if ($ids !== null) {
        if (!$ids) return [];
        $where .= ' AND l.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $params = array_values($ids);
    }

    $st = $pdo->prepare("SELECT l.* FROM leads l WHERE $where ORDER BY l.created_at DESC");
    $st->execute($params);
    $leads = [];
    foreach ($st->fetchAll() as $row) $leads[$row['id']] = shape_lead($row);
    if (!$leads) return [];

    $st = $pdo->prepare("SELECT h.lead_id, h.stage, h.at FROM stage_history h JOIN leads l ON l.id = h.lead_id
        WHERE $where ORDER BY h.at, h.seq");
    $st->execute($params);
    foreach ($st->fetchAll() as $h) {
        $leads[$h['lead_id']]['history'][] = ['stage' => $h['stage'], 'at' => to_iso($h['at'])];
    }

    $st = $pdo->prepare("SELECT a.id, a.lead_id, a.type, a.text, a.at, u.name AS by_name FROM activities a
        JOIN leads l ON l.id = a.lead_id LEFT JOIN users u ON u.id = a.user_id
        WHERE $where ORDER BY a.at DESC, a.seq DESC");
    $st->execute($params);
    foreach ($st->fetchAll() as $a) {
        $leads[$a['lead_id']]['activities'][] = [
            'id' => $a['id'], 'type' => $a['type'], 'text' => $a['text'], 'at' => to_iso($a['at']), 'by' => $a['by_name'],
        ];
    }
    return array_values($leads);
}

function load_lead(string $id): array
{
    $found = load_leads([$id]);
    if (!$found) fail(404, 'This lead no longer exists.');
    return $found[0];
}

function insert_activity(string $leadId, string $type, string $text, string $at, ?int $userId, ?string $id = null): void
{
    db()->prepare('INSERT INTO activities (id, lead_id, type, text, at, user_id) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$id ?? new_id('act'), $leadId, $type, $text, $at, $userId]);
}

function insert_history(string $leadId, string $stage, string $at): void
{
    db()->prepare('INSERT INTO stage_history (lead_id, stage, at) VALUES (?, ?, ?)')->execute([$leadId, $stage, $at]);
}

function lock_lead(string $id): array
{
    $st = db()->prepare('SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL FOR UPDATE');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail(404, 'This lead no longer exists.');
    return $row;
}

/* ---------- Routes ---------- */

function route_bootstrap(): array
{
    $user = require_user();
    return ['user' => $user, 'users' => list_users(), 'leads' => load_leads()];
}

function route_create_lead(): array
{
    $user = require_user();
    $in = body();
    $data = clean_lead_input($in, false);
    $id = $in['id'] ?? new_id('lead');
    if (!valid_id($id)) fail(422, 'The lead id isn’t valid.');
    $stage = $data['stage'] ?? 'new';
    $now = now_db();

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO leads (id, name, title, company, email, phone, source, owner, stage, value, notes,
                next_follow_up, created_at, updated_at, stage_changed_at, closed_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                $id, $data['name'], $data['title'] ?? '', $data['company'], $data['email'] ?? '', $data['phone'] ?? '',
                $data['source'] ?? '', $data['owner'] ?? '', $stage, $data['value'] ?? 0, $data['notes'] ?? '',
                $data['next_follow_up'] ?? null, $now, $now, $now, in_array($stage, OPEN_STAGES, true) ? null : $now, $user['id'],
            ]);
        insert_history($id, $stage, $now);
        insert_activity($id, 'created', 'Lead created', $now, $user['id']);
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($e->getCode() === '23000') fail(409, 'A lead with this id already exists.');
        throw $e;
    }
    return ['lead' => load_lead($id)];
}

function route_update_lead(string $id): array
{
    $user = require_user();
    $data = clean_lead_input(body(), true);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $row = lock_lead($id);
        $now = now_db();
        $newStage = $data['stage'] ?? null;
        unset($data['stage']);

        $sets = [];
        $params = [];
        foreach ($data as $column => $value) { // column names come from the whitelist above
            $sets[] = "`$column` = ?";
            $params[] = $value;
        }
        if ($newStage !== null && $newStage !== $row['stage']) {
            array_push($sets, 'stage = ?', 'stage_changed_at = ?', 'closed_at = ?');
            array_push($params, $newStage, $now, in_array($newStage, OPEN_STAGES, true) ? null : $now);
            insert_history($id, $newStage, $now);
            insert_activity($id, 'stage', 'Moved from ' . STAGES[$row['stage']] . ' to ' . STAGES[$newStage], $now, $user['id']);
        }
        $sets[] = 'updated_at = ?';
        $params[] = $now;
        $params[] = $id;
        $pdo->prepare('UPDATE leads SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['lead' => load_lead($id)];
}

function route_add_activity(string $id): array
{
    $user = require_user();
    $in = body();
    $type = $in['type'] ?? '';
    $text = is_string($in['text'] ?? null) ? trim($in['text']) : '';
    if (!in_array($type, ACTIVITY_TYPES, true)) fail(422, 'Pick a note, call, email or meeting.', 'type');
    if ($text === '') fail(422, 'Describe what happened.', 'text');
    if (text_len($text) > 5000) fail(422, 'That note is too long.', 'text');
    $activityId = $in['id'] ?? null;
    if ($activityId !== null && !valid_id($activityId)) $activityId = null;

    $pdo = db();
    $pdo->beginTransaction();
    try {
        lock_lead($id);
        $now = now_db();
        insert_activity($id, $type, $text, $now, $user['id'], $activityId);
        $sql = $type === 'note' ? 'UPDATE leads SET updated_at = ? WHERE id = ?' : 'UPDATE leads SET updated_at = ?, last_contact_at = ? WHERE id = ?';
        $pdo->prepare($sql)->execute($type === 'note' ? [$now, $id] : [$now, $now, $id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e instanceof PDOException && $e->getCode() === '23000') fail(409, 'That activity was already saved.');
        throw $e;
    }
    return ['lead' => load_lead($id)];
}

/** Soft delete so "Undo" can restore it. Deleted leads are purged after 30 days. */
function route_delete_lead(string $id): array
{
    require_user();
    $now = now_db();
    $st = db()->prepare('UPDATE leads SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL');
    $st->execute([$now, $id]);
    if ($st->rowCount() === 0) fail(404, 'This lead no longer exists.');
    db()->prepare('DELETE FROM leads WHERE deleted_at < ?')->execute([(new DateTimeImmutable('-30 days'))->format('Y-m-d H:i:s.v')]);
    return ['ok' => true];
}

function route_restore_lead(string $id): array
{
    require_user();
    $st = db()->prepare('UPDATE leads SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL');
    $st->execute([$id]);
    return ['lead' => load_lead($id)];
}

/** Admin only: replace every lead with the given set (used to load demo data). */
function route_replace_leads(): array
{
    $user = require_admin();
    $incoming = body()['leads'] ?? null;
    if (!is_array($incoming) || count($incoming) > MAX_IMPORT) fail(422, 'Send up to ' . MAX_IMPORT . ' leads.');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->exec('DELETE FROM leads');
        $insert = $pdo->prepare('INSERT INTO leads (id, name, title, company, email, phone, source, owner, stage, value, notes,
                next_follow_up, created_at, updated_at, stage_changed_at, closed_at, last_contact_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($incoming as $lead) {
            if (!is_array($lead) || !valid_id($lead['id'] ?? null)) fail(422, 'Every lead needs a valid id.');
            $d = clean_lead_input($lead, false);
            $created = to_db($lead['createdAt'] ?? null) ?? now_db();
            $stage = $d['stage'] ?? 'new';
            $insert->execute([
                $lead['id'], $d['name'], $d['title'] ?? '', $d['company'], $d['email'] ?? '', $d['phone'] ?? '',
                $d['source'] ?? '', $d['owner'] ?? '', $stage, $d['value'] ?? 0, $d['notes'] ?? '', $d['next_follow_up'] ?? null,
                $created, to_db($lead['updatedAt'] ?? null) ?? $created, to_db($lead['stageChangedAt'] ?? null) ?? $created,
                in_array($stage, OPEN_STAGES, true) ? null : (to_db($lead['closedAt'] ?? null) ?? $created),
                to_db($lead['lastContactAt'] ?? null), $user['id'],
            ]);
            foreach (($lead['history'] ?? []) as $h) {
                if (isset(STAGES[$h['stage'] ?? ''])) insert_history($lead['id'], $h['stage'], to_db($h['at'] ?? null) ?? $created);
            }
            foreach (($lead['activities'] ?? []) as $a) {
                $type = $a['type'] ?? '';
                if (!in_array($type, [...ACTIVITY_TYPES, 'created', 'stage'], true) || !is_string($a['text'] ?? null)) continue;
                insert_activity($lead['id'], $type, substr($a['text'], 0, 5000), to_db($a['at'] ?? null) ?? $created, null,
                    valid_id($a['id'] ?? null) ? $a['id'] : null);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e instanceof PDOException && $e->getCode() === '23000') fail(409, 'Two leads or activities share an id.');
        throw $e;
    }
    return ['leads' => load_leads()];
}

function route_clear_leads(): array
{
    require_admin();
    db()->exec('DELETE FROM leads');
    return ['leads' => []];
}
