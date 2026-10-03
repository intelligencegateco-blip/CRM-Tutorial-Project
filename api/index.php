<?php
// Groundwork CRM API. Every /api/* request is routed here by api/.htaccess.

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/leads.php';

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $route = trim((string) ($_GET['route'] ?? ''), '/');
    $parts = $route === '' ? [] : explode('/', $route);

    // Every write must carry this header. Browsers won't send it cross-site
    // without a CORS preflight we never approve, which blocks CSRF.
    if ($method !== 'GET' && ($_SERVER['HTTP_X_CRM_REQUEST'] ?? '') !== '1') {
        fail(403, 'This request is missing its security header.');
    }

    $p0 = $parts[0] ?? '';
    $p1 = $parts[1] ?? null;
    $p2 = $parts[2] ?? null;
    $count = count($parts);

    if ($method === 'GET' && $route === 'health') {
        db()->query('SELECT 1');
        respond(['ok' => true]);
    }
    if ($method === 'GET' && $route === 'session') respond(route_session());
    if ($method === 'POST' && $route === 'setup') respond(route_setup());
    if ($method === 'POST' && $route === 'login') respond(route_login());
    if ($method === 'POST' && $route === 'logout') respond(route_logout());
    if ($method === 'POST' && $route === 'account/password') respond(route_change_password());
    if ($method === 'GET' && $route === 'bootstrap') respond(route_bootstrap());

    if ($p0 === 'users') {
        if ($method === 'GET' && $count === 1) { require_user(); respond(['users' => list_users()]); }
        if ($method === 'POST' && $count === 1) respond(route_create_user());
        if ($method === 'DELETE' && $count === 2) respond(route_delete_user($p1));
    }

    if ($p0 === 'leads') {
        if ($method === 'GET' && $count === 1) { require_user(); respond(['leads' => load_leads()]); }
        if ($method === 'POST' && $count === 1) respond(route_create_lead());
        if ($method === 'POST' && $route === 'leads/replace') respond(route_replace_leads());
        if ($method === 'POST' && $route === 'leads/clear') respond(route_clear_leads());
        if ($p1 !== null && valid_id($p1)) {
            if ($method === 'PATCH' && $count === 2) respond(route_update_lead($p1));
            if ($method === 'DELETE' && $count === 2) respond(route_delete_lead($p1));
            if ($method === 'POST' && $p2 === 'restore' && $count === 3) respond(route_restore_lead($p1));
            if ($method === 'POST' && $p2 === 'activities' && $count === 3) respond(route_add_activity($p1));
        }
    }

    fail(404, 'Not found.');
} catch (HttpError $e) {
    respond(['error' => $e->getMessage(), 'field' => $e->field], $e->status);
} catch (Throwable $e) {
    error_log('[crm] ' . $e);
    respond(['error' => 'Something went wrong on the server. Try again in a moment.'], 500);
}
