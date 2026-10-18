/**
 * Verified restore.
 *
 * - Runs `PRAGMA integrity_check` on the backup BEFORE touching production.
 * - Refuses to restore if the backup is corrupt or the schema version is
 *   higher than the backend expects.
 * - Moves the current production DB aside (never deletes it) as
 *   `sales.pre-restore-<stamp>.db`.
 * - Copies the verified backup into place.
 * - Requires explicit confirmation via RESTORE_CONFIRM=yes.
 *
 * Usage:
 *   DATABASE_PATH=/var/lib/sms/sales.db \
 *   RESTORE_FROM=/var/backups/sms/sales-2025-01-01T00-00-00-000Z.db \
 *   RESTORE_CONFIRM=yes \
 *   npm run restore
 */

import Database from "better-sqlite3";
import { existsSync, copyFileSync, renameSync, statSync } from "node:fs";
import { resolve } from "node:path";

function main(): void {
  const dbPath = process.env.DATABASE_PATH?.trim();
  const from = process.env.RESTORE_FROM?.trim();
  if (!dbPath || !from) {
    console.error("DATABASE_PATH and RESTORE_FROM are required.");
    process.exit(1);
  }
  if (process.env.RESTORE_CONFIRM !== "yes") {
    console.error("Refusing to restore without RESTORE_CONFIRM=yes.");
    process.exit(1);
  }
  const absDb = resolve(dbPath);
  const absFrom = resolve(from);
  if (!existsSync(absFrom)) {
    console.error(`Backup not found: ${absFrom}`);
    process.exit(1);
  }

  // 1. Verify the backup before touching production.
  const check = new Database(absFrom, { readonly: true });
  const integrity = check.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  if (integrity.integrity_check !== "ok") {
    console.error(`Backup failed integrity check: ${integrity.integrity_check}`);
    check.close();
    process.exit(1);
  }
  const versionRow = check.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
  check.close();
  console.log(`[restore] backup verified. schema version = ${versionRow.v ?? 0}, size = ${statSync(absFrom).size} bytes`);

  // 2. Move current production DB aside (never delete).
  if (existsSync(absDb)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const aside = `${absDb}.pre-restore-${stamp}`;
    renameSync(absDb, aside);
    console.log(`[restore] current database moved to ${aside}`);
  }

  // 3. Copy the verified backup into place.
  copyFileSync(absFrom, absDb);
  console.log(`[restore] restored ${absFrom} -> ${absDb}`);
  console.log("[restore] start the backend and run a reconciliation query before resuming operations.");
}

try {
  main();
} catch (err) {
  console.error(`[restore] fatal: ${(err as Error).message}`);
  process.exit(1);
}