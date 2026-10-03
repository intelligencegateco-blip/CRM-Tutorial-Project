<?php
// Shared setup for every API request: config, database, JSON helpers.

declare(strict_types=1);

const STAGES = [
    'new' => 'New',
    'contacted' => 'Contacted',
    'qualified' => 'Qualified',
    'proposal' => 'Proposal sent',
    'negotiation' => 'Negotiation',
    'won' => 'Won',
    'lost' => 'Lost',
];
const OPEN_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting'];
const SCHEMA_VERSION = 1;

date_default_timezone_set('UTC');
ini_set('display_errors', '0');
error_reporting(E_ALL);

final class HttpError extends Exception
{
    public int $status;
    public ?string $field;

    public function __construct(int $status, string $message, ?string $field = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->field = $field;
    }
}

function fail(int $status, string $message, ?string $field = null): void
{
    throw new HttpError($status, $message, $field);
}

function respond($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array
{
    static $parsed = null;
    if ($parsed !== null) return $parsed;
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return $parsed = [];
    $data = json_decode($raw, true);
    if (!is_array($data)) fail(400, 'The request body must be JSON.');
    return $parsed = $data;
}

/**
 * Credentials live outside the web root (and outside Git) in crm-config.php,
 * next to public_html. See README for its shape.
 */
function config(): array
{
    static $config = null;
    if ($config !== null) return $config;
    $publicRoot = dirname(__DIR__, 2);
    $candidates = array_filter([
        getenv('CRM_CONFIG') ?: null,
        dirname($publicRoot) . '/crm-config.php',
        dirname($publicRoot, 3) . '/crm-config.php',
    ]);
    foreach ($candidates as $path) {
        if (is_file($path)) {
            $loaded = require $path;
            if (is_array($loaded)) return $config = $loaded;
        }
    }
    fail(503, 'The server isn’t configured yet. Add crm-config.php next to public_html.');
    return [];
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config()['db'];
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'] ?? 3306, $c['name']);
    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS meta (k VARCHAR(50) PRIMARY KEY, v TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $version = (int) ($pdo->query("SELECT v FROM meta WHERE k = 'schema_version'")->fetchColumn() ?: 0);
    if ($version >= SCHEMA_VERSION) return;

    $opts = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(10) NOT NULL DEFAULT 'member',
        created_at DATETIME(3) NOT NULL,
        last_login_at DATETIME(3) NULL
    ) $opts");
    $pdo->exec("CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        created_at DATETIME(3) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        INDEX (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) $opts");
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL,
        at DATETIME(3) NOT NULL,
        INDEX (email, at)
    ) $opts");
    $pdo->exec("CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        title VARCHAR(160) NOT NULL DEFAULT '',
        company VARCHAR(160) NOT NULL,
        email VARCHAR(190) NOT NULL DEFAULT '',
        phone VARCHAR(60) NOT NULL DEFAULT '',
        source VARCHAR(60) NOT NULL DEFAULT '',
        owner VARCHAR(100) NOT NULL DEFAULT '',
        stage VARCHAR(20) NOT NULL DEFAULT 'new',
        value BIGINT UNSIGNED NOT NULL DEFAULT 0,
        notes TEXT NOT NULL,
        next_follow_up DATE NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        stage_changed_at DATETIME(3) NOT NULL,
        closed_at DATETIME(3) NULL,
        last_contact_at DATETIME(3) NULL,
        deleted_at DATETIME(3) NULL,
        created_by INT UNSIGNED NULL,
        INDEX (deleted_at),
        INDEX (stage)
    ) $opts");
    $pdo->exec("CREATE TABLE IF NOT EXISTS activities (
        seq BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        id VARCHAR(64) NOT NULL UNIQUE,
        lead_id VARCHAR(64) NOT NULL,
        type VARCHAR(20) NOT NULL,
        text TEXT NOT NULL,
        at DATETIME(3) NOT NULL,
        user_id INT UNSIGNED NULL,
        INDEX (lead_id, at),
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    ) $opts");
    $pdo->exec("CREATE TABLE IF NOT EXISTS stage_history (
        seq BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        lead_id VARCHAR(64) NOT NULL,
        stage VARCHAR(20) NOT NULL,
        at DATETIME(3) NOT NULL,
        INDEX (lead_id, at),
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    ) $opts");

    $set = $pdo->prepare("REPLACE INTO meta (k, v) VALUES ('schema_version', ?)");
    $set->execute([(string) SCHEMA_VERSION]);
}

/* ---------- Time & ids ---------- */

function now_db(): string
{
    return (new DateTimeImmutable('now'))->format('Y-m-d H:i:s.v');
}

function to_db(?string $iso): ?string
{
    if ($iso === null || $iso === '') return null;
    try {
        return (new DateTimeImmutable($iso))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    } catch (Exception $e) {
        fail(422, 'A date in the request is not valid.');
        return null;
    }
}

function to_iso(?string $db): ?string
{
    if ($db === null) return null;
    return (new DateTimeImmutable($db, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

function new_id(string $prefix): string
{
    return $prefix . '_' . bin2hex(random_bytes(8));
}

function valid_id($id): bool
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_]{4,64}$/', $id) === 1;
}

function text_len(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s) : strlen($s);
}
