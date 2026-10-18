/**
 * Consistent SQLite backup.
 *
 * - Uses `VACUUM INTO` which produces a fully consistent snapshot even while
 *   the database is in WAL mode and being written to. Do NOT copy the .db file
 *   directly — that can capture a torn WAL state.
 * - Backups are written outside the public web directory (BACKUP_DIR).
 * - Retention: keeps the last N backups (default 14) plus any backup marked
 *   with the `.keep` suffix. Never deletes the only known-good backup.
 * - Records timestamp, size, and status in a `backup_log` table.
 * - On failure, logs clearly and preserves existing backups.
 *
 * Usage:
 *   DATABASE_PATH=/var/lib/sms/sales.db BACKUP_DIR=/var/backups/sms npm run backup
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const RETENTION = Number(process.env.BACKUP_RETENTION ?? 14);

function ensureBackupLog(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS backup_log (
       id TEXT PRIMARY KEY,
       started_at TEXT NOT NULL,
       finished_at TEXT,
       path TEXT NOT NULL,
       size_bytes INTEGER,
       status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
       error TEXT
     )`,
  );
}

function pruneOldBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("sales-") && f.endsWith(".db"))
    .map((f) => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const keep = files.filter((f) => f.name.endsWith(".keep.db"));
  const normal = files.filter((f) => !f.name.endsWith(".keep.db"));

  // Never delete the newest backup, even if it exceeds retention.
  const toDelete = normal.slice(Math.max(RETENTION, 1));
  for (const f of toDelete) {
    if (keep.some((k) => k.path === f.path)) continue;
    try {
      unlinkSync(f.path);
      console.log(`[backup] pruned ${f.name}`);
    } catch (err) {
      console.error(`[backup] failed to prune ${f.name}: ${(err as Error).message}`);
    }
  }
}

function main(): void {
  const dbPath = process.env.DATABASE_PATH?.trim();
  const backupDir = process.env.BACKUP_DIR?.trim();
  if (!dbPath || !backupDir) {
    console.error("DATABASE_PATH and BACKUP_DIR are required.");
    process.exit(1);
  }
  const absDb = resolve(dbPath);
  const absBackup = resolve(backupDir);
  if (!existsSync(absDb)) {
    console.error(`Database not found: ${absDb}`);
    process.exit(1);
  }
  if (!existsSync(absBackup)) mkdirSync(absBackup, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetPath = join(absBackup, `sales-${stamp}.db`);

  const db = new Database(absDb);
  db.pragma("busy_timeout = 10000");
  ensureBackupLog(db);

  const id = `bk-${stamp}`;
  db.prepare("INSERT INTO backup_log (id, started_at, path, status) VALUES (?, ?, ?, 'running')").run(
    id, new Date().toISOString(), targetPath,
  );

  try {
    // VACUUM INTO produces a consistent snapshot; safe with WAL.
    db.prepare("VACUUM INTO ?").run(targetPath);
    const size = statSync(targetPath).size;
    db.prepare("UPDATE backup_log SET finished_at = ?, size_bytes = ?, status = 'completed' WHERE id = ?").run(
      new Date().toISOString(), size, id,
    );
    console.log(`[backup] completed: ${targetPath} (${size} bytes)`);
    pruneOldBackups(absBackup);
  } catch (err) {
    const msg = (err as Error).message;
    db.prepare("UPDATE backup_log SET finished_at = ?, status = 'failed', error = ? WHERE id = ?").run(
      new Date().toISOString(), msg, id,
    );
    console.error(`[backup] FAILED: ${msg}. Existing backups were preserved.`);
    db.close();
    process.exit(1);
  }

  db.close();
}

try {
  main();
} catch (err) {
  console.error(`[backup] fatal: ${(err as Error).message}`);
  process.exit(1);
}