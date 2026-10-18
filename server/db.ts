/**
 * SQLite database bootstrap for the Sales Management System backend.
 *
 * Driver choice: better-sqlite3.
 *   - Synchronous API keeps repository code simple and predictable.
 *   - Battle-tested, actively maintained, supports WAL and foreign keys.
 *   - No async connection pool needed for a single-file local database.
 *
 * The database file path is read from DATABASE_PATH. The file is opened
 * (never recreated) and migrations are applied idempotently. If the file
 * cannot be opened, the process exits with a clear error — it never falls
 * back to an in-memory database in production.
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DbConfig {
  path: string;
  readonly: boolean;
  wal: boolean;
  busyTimeoutMs: number;
}

export function loadDbConfig(): DbConfig {
  const envPath = process.env.DATABASE_PATH?.trim();
  if (!envPath) {
    throw new Error(
      "DATABASE_PATH is not set. Refusing to start: the backend will not create a database in a temporary directory or inside the frontend assets.",
    );
  }
  const abs = resolve(envPath);
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const wal = process.env.SQLITE_WAL !== "0" && nodeEnv !== "test";
  const busyTimeoutMs = Number(process.env.SQLITE_BUSY_TIMEOUT_MS ?? "5000");
  return { path: abs, readonly: false, wal, busyTimeoutMs };
}

export interface DbHandle {
  db: Database.Database;
  config: DbConfig;
  schemaVersion: number;
}

const EXPECTED_SCHEMA_VERSION = 1;

export function openDatabase(config: DbConfig): DbHandle {
  let db: Database.Database;
  try {
    db = new Database(config.path, { fileMustExist: false, readonly: config.readonly });
  } catch (err) {
    throw new Error(
      `Failed to open SQLite database at ${config.path}: ${(err as Error).message}. ` +
        "Check that the directory exists, is writable, and is on persistent storage.",
    );
  }

  db.pragma("foreign_keys = ON");
  db.pragma(`busy_timeout = ${config.busyTimeoutMs}`);
  if (config.wal) {
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
    } catch {
      // WAL is not supported on some network filesystems; fall back silently.
    }
  }

  applyMigrations(db);
  const version = currentSchemaVersion(db);
  if (version !== EXPECTED_SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `Schema version mismatch: database is at v${version}, backend expects v${EXPECTED_SCHEMA_VERSION}. ` +
        "Run the migration command before starting the server.",
    );
  }

  return { db, config, schemaVersion: version };
}

function currentSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}

function applyMigrations(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version),
  );

  const schemaSql = readFileSync(resolve(__dirname, "schema.sql"), "utf8");
  const statements = schemaSql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  const tx = db.transaction(() => {
    for (const stmt of statements) db.exec(stmt);
    if (!applied.has(EXPECTED_SCHEMA_VERSION)) {
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        EXPECTED_SCHEMA_VERSION,
        new Date().toISOString(),
      );
    }
  });
  tx();
}

export function closeDatabase(handle: DbHandle): void {
  try {
    handle.db.close();
  } catch {
    /* already closed */
  }
}