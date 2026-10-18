/**
 * Ordered, versioned migration runner.
 *
 * - Reads .sql files from ./migrations in lexical order (001_, 002_, ...).
 * - Records each applied migration in schema_migrations.
 * - Backs up the database file before applying anything (unless --no-backup).
 * - Wraps each migration in a transaction; a failure rolls that migration back
 *   and stops the run. Previously applied migrations are never re-run.
 * - Never drops tables. Never inserts demo data.
 *
 * Usage:
 *   DATABASE_PATH=/var/lib/sms/sales.db npm run migrate
 *   DATABASE_PATH=/var/lib/sms/sales.db npm run migrate -- --no-backup
 *   DATABASE_PATH=/var/lib/sms/sales.db npm run migrate -- --dry-run
 */

import Database from "better-sqlite3";
import { readdirSync, readFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "migrations");

interface Migration {
  version: number;
  name: string;
  path: string;
  sql: string;
}

function loadMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  return files.map((f) => {
    const version = Number(f.slice(0, f.indexOf("_")));
    if (!Number.isInteger(version) || version <= 0) {
      throw new Error(`Invalid migration filename: ${f}`);
    }
    return { version, name: f, path: join(MIGRATIONS_DIR, f), sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8") };
  });
}

function appliedVersions(db: Database.Database): Set<number> {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  return new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version),
  );
}

function backupDatabase(dbPath: string): string {
  const dir = dirname(dbPath);
  const backupDir = join(dir, "backups");
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `sales-${stamp}.db`);
  copyFileSync(dbPath, backupPath);
  return backupPath;
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const noBackup = args.has("--no-backup");

  const dbPath = process.env.DATABASE_PATH?.trim();
  if (!dbPath) {
    console.error("DATABASE_PATH is not set. Refusing to run migrations.");
    process.exit(1);
  }
  const abs = resolve(dbPath);

  const migrations = loadMigrations();
  if (migrations.length === 0) {
    console.error("No migrations found in", MIGRATIONS_DIR);
    process.exit(1);
  }

  if (!dryRun && existsSync(abs) && !noBackup) {
    const backupPath = backupDatabase(abs);
    console.log(`[migrate] backup written: ${backupPath}`);
  } else if (!existsSync(abs)) {
    console.log(`[migrate] database does not exist yet, will be created: ${abs}`);
  }

  const db = new Database(abs);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const applied = appliedVersions(db);
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log("[migrate] database is up to date. Nothing to apply.");
    db.close();
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s):`);
  for (const m of pending) console.log(`  - v${m.version} ${m.name}`);

  if (dryRun) {
    console.log("[migrate] dry run — no changes applied.");
    db.close();
    return;
  }

  for (const m of pending) {
    const statements = m.sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    const tx = db.transaction(() => {
      for (const stmt of statements) db.exec(stmt);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        m.version,
        new Date().toISOString(),
      );
    });

    try {
      tx();
      console.log(`[migrate] applied v${m.version} ${m.name}`);
    } catch (err) {
      console.error(`[migrate] FAILED on v${m.version} ${m.name}: ${(err as Error).message}`);
      console.error("[migrate] this migration was rolled back. Earlier migrations remain applied.");
      console.error("[migrate] restore from the backup above, fix the migration, and re-run.");
      db.close();
      process.exit(1);
    }
  }

  console.log("[migrate] done.");
  db.close();
}

try {
  main();
} catch (err) {
  console.error(`[migrate] fatal: ${(err as Error).message}`);
  process.exit(1);
}