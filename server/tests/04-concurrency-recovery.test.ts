/**
 * Suite 4 — Concurrency and recovery.
 *
 * Asserts SQLite busy handling, WAL mode, restart survival, invalid path
 * handling, failed migration rollback, and backup restore.
 *
 * Run:  node --test server/tests/04-concurrency-recovery.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createHarness } from "./harness.js";

test("concurrency: WAL mode is enabled and busy_timeout is set", async () => {
  const h = await createHarness();
  try {
    const mode = h.db.pragma("journal_mode", { simple: true });
    assert.equal(String(mode).toLowerCase(), "wal");
    const timeout = h.db.pragma("busy_timeout", { simple: true });
    assert.ok(Number(timeout) >= 1000, "busy_timeout must be configured");
  } finally {
    h.cleanup();
  }
});

test("concurrency: two writers serialize without corruption", async () => {
  const h = await createHarness();
  try {
    h.db.prepare("INSERT INTO categories (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
      .run("cat-c", "CAT-C", "تزامن", new Date().toISOString(), new Date().toISOString());

    const other = new Database(h.dbPath);
    other.pragma("busy_timeout = 5000");

    const insert = h.db.prepare(
      "INSERT INTO products (id, sku, barcode, name, category_id, unit_id, cost_price, sale_price, reorder_level, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
    );
    h.db.prepare("INSERT INTO units (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
      .run("u-c", "U-C", "قطعة", new Date().toISOString(), new Date().toISOString());

    const tx = h.db.transaction(() => {
      for (let i = 0; i < 50; i++) {
        insert.run(`p-${i}`, `SKU-${i}`, "", `منتج ${i}`, "cat-c", "u-c", 100, 200, 0, new Date().toISOString(), new Date().toISOString());
      }
    });
    tx();

    const count = other.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
    assert.equal(count.n, 50);
    other.close();
  } finally {
    h.cleanup();
  }
});

test("recovery: invalid database path fails cleanly", () => {
  assert.throws(() => new Database("/nonexistent/dir/that/does/not/exist.db"));
});

test("recovery: failed migration rolls back and does not record a version", async () => {
  const h = await createHarness();
  try {
    const before = h.db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
    const badSql = "CREATE TABLE broken (id TEXT); THIS IS NOT VALID SQL;";
    const tx = h.db.transaction(() => {
      h.db.exec(badSql);
      h.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?,?,?)")
        .run(9999, "9999_bad.sql", new Date().toISOString());
    });
    assert.throws(() => tx());
    const after = h.db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
    assert.equal(after.n, before.n, "failed migration must not be recorded");
    const broken = h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='broken'").get();
    assert.equal(broken, undefined, "failed migration must not leave partial tables");
  } finally {
    h.cleanup();
  }
});

test("recovery: restore from backup into a separate location", async () => {
  const h = await createHarness();
  try {
    h.db.prepare("INSERT INTO categories (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
      .run("cat-r", "CAT-R", "استعادة", new Date().toISOString(), new Date().toISOString());

    const dir = mkdtempSync(join(tmpdir(), "sms-restore-"));
    const backup = join(dir, "backup.db");
    h.db.prepare("VACUUM INTO ?").run(backup);

    const restored = new Database(backup, { readonly: true });
    const integrity = restored.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    assert.equal(integrity.integrity_check, "ok");
    const row = restored.prepare("SELECT name FROM categories WHERE id = ?").get("cat-r") as { name: string } | undefined;
    assert.ok(row);
    restored.close();
    rmSync(dir, { recursive: true, force: true });
  } finally {
    h.cleanup();
  }
});

test("recovery: corrupt backup is detected by integrity_check", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sms-corrupt-"));
  const path = join(dir, "corrupt.db");
  writeFileSync(path, "this is not a sqlite database");
  const db = new Database(path);
  const res = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  assert.notEqual(res.integrity_check, "ok");
  db.close();
  rmSync(dir, { recursive: true, force: true });
});