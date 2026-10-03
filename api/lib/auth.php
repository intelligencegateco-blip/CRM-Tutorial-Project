<?php
// Accounts and sign-in. Sessions are random tokens in an HttpOnly cookie;
// only a SHA-256 hash of each token is stored.

declare(strict_types=1);

const SESSION_COOKIE = 'crm_session';
const SESSION_DAYS = 30;
const MIN_PASSWORD = 10;
const MAX_FAILED_LOGINS = 10; // per email, per 15 minutes

function user_count(): int
{
    return (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
}

function current_user(): ?array
{
    static $user = false;
    if ($user !== false) return $user;
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return $user = null;
    $st = db()->prepare('SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?');
    $st->execute([hash('sha256', $token), now_db()]);
    $row = $st->fetch();
    return $user = $row ? public_user($row) : null;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) fail(401, 'Sign in to continue.');
    return $user;
}

function require_admin(): array
{
    $user = require_user();
    if ($user['role'] !== 'admin') fail(403, 'Only an admin can do that.');
    return $user;
}

function public_user(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'email' => $row['email'],
        'role' => $row['role'],
    ];
}

function start_session(int $userId): void
{
    $token = bin2hex(random_bytes(32));
    $expires = (new DateTimeImmutable('now'))->modify('+' . SESSION_DAYS . ' days');
    db()->prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $userId, now_db(), $expires->format('Y-m-d H:i:s.v')]);
    db()->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([now_db(), $userId]);
    db()->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([now_db()]);
    set_session_cookie($token, $expires->getTimestamp());
}

function set_session_cookie(string $value, int $expires): void
{
    setcookie(SESSION_COOKIE, $value, [
        'expires' => $expires,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function clean_email($email): string
{
    $email = is_string($email) ? strtolower(trim($email)) : '';
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        fail(422, 'Enter an email like name@company.com.', 'email');
    }
    return $email;
}

function clean_name($name): string
{
    $name = is_string($name) ? trim($name) : '';
    if ($name === '') fail(422, 'Enter a name.', 'name');
    if (text_len($name) > 100) fail(422, 'That name is too long.', 'name');
    return $name;
}

function check_password_strength($password, string $field = 'password'): string
{
    if (!is_string($password) || text_len($password) < MIN_PASSWORD) {
        fail(422, 'Use at least ' . MIN_PASSWORD . ' characters for the password.', $field);
    }
    if (strlen($password) > 200) fail(422, 'That password is too long.', $field);
    return $password;
}

function throttle(string $key): void
{
    $since = (new DateTimeImmutable('-15 minutes'))->format('Y-m-d H:i:s.v');
    $st = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE email = ? AND at > ?');
    $st->execute([$key, $since]);
    if ((int) $st->fetchColumn() >= MAX_FAILED_LOGINS) {
        fail(429, 'Too many failed attempts. Wait 15 minutes and try again.');
    }
}

function record_failure(string $key): void
{
    db()->prepare('INSERT INTO login_attempts (email, at) VALUES (?, ?)')->execute([$key, now_db()]);
    db()->prepare('DELETE FROM login_attempts WHERE at < ?')->execute([(new DateTimeImmutable('-1 day'))->format('Y-m-d H:i:s.v')]);
}

/* ---------- Routes ---------- */

function route_session(): array
{
    return ['user' => current_user(), 'needsSetup' => user_count() === 0];
}

/** First run: create the owner account using the one-time setup code from crm-config.php. */
function route_setup(): array
{
    if (user_count() > 0) fail(409, 'This CRM is already set up. Sign in instead.');
    throttle('__setup__');
    $in = body();
    $expected = (string) (config()['setup_code'] ?? '');
    $given = strtoupper(trim((string) ($in['code'] ?? '')));
    if ($expected === '' || !hash_equals(strtoupper($expected), $given)) {
        record_failure('__setup__');
        fail(403, 'That setup code isn’t right.', 'code');
    }
    $name = clean_name($in['name'] ?? '');
    $email = clean_email($in['email'] ?? '');
    $password = check_password_strength($in['password'] ?? '');
    db()->prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), 'admin', now_db()]);
    $id = (int) db()->lastInsertId();
    start_session($id);
    return ['user' => ['id' => $id, 'name' => $name, 'email' => $email, 'role' => 'admin']];
}

function route_login(): array
{
    $in = body();
    $email = is_string($in['email'] ?? null) ? strtolower(trim($in['email'])) : '';
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    if ($email === '' || $password === '') fail(422, 'Enter your email and password.');
    throttle($email);
    $st = db()->prepare('SELECT * FROM users WHERE email = ?');
    $st->execute([$email]);
    $row = $st->fetch();
    if (!$row || !password_verify($password, $row['password_hash'])) {
        record_failure($email);
        fail(401, 'That email and password don’t match an account.');
    }
    if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
    }
    start_session((int) $row['id']);
    return ['user' => public_user($row)];
}

function route_logout(): array
{
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (is_string($token) && $token !== '') {
        db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }
    set_session_cookie('', 1);
    return ['ok' => true];
}

function route_change_password(): array
{
    $user = require_user();
    $in = body();
    $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $st->execute([$user['id']]);
    if (!password_verify((string) ($in['current'] ?? ''), (string) $st->fetchColumn())) {
        fail(422, 'Your current password isn’t right.', 'current');
    }
    $new = check_password_strength($in['password'] ?? '');
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    // Sign out every other device.
    $token = (string) ($_COOKIE[SESSION_COOKIE] ?? '');
    db()->prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')->execute([$user['id'], hash('sha256', $token)]);
    return ['ok' => true];
}

function list_users(): array
{
    $rows = db()->query('SELECT id, name, email, role FROM users ORDER BY name')->fetchAll();
    return array_map('public_user', $rows);
}

function route_create_user(): array
{
    require_admin();
    $in = body();
    $name = clean_name($in['name'] ?? '');
    $email = clean_email($in['email'] ?? '');
    $password = check_password_strength($in['password'] ?? '');
    $role = ($in['role'] ?? 'member') === 'admin' ? 'admin' : 'member';
    try {
        db()->prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $role, now_db()]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail(409, 'Someone already uses that email.', 'email');
        throw $e;
    }
    return ['users' => list_users()];
}

function route_delete_user(string $id): array
{
    $admin = require_admin();
    if ((int) $id === $admin['id']) fail(422, 'You can’t remove your own account.');
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([(int) $id]);
    return ['users' => list_users()];
}
