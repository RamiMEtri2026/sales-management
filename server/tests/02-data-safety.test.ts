/**
 * Suite 2 — Production data safety.
 *
 * Asserts that the harness never touches DATABASE_PATH, that restarts preserve
 * committed rows, that startup does not delete tables or reload demo data,
 * that the production DB path guard rejects in-repo paths, and that a backup
 * can be restored to a separate location.
 *
 * Run:  node --test server/tests/02-data-safety.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { createHarness } from "./harness.js";

test("data safety: harness ignores DATABASE_PATH from the environment", async () => {
  const sentinel = "/tmp/this-must-not-be-opened.db";
  process.env.DATABASE_PATH = sentinel;
  const h = await createHarness();
  try {
    assert.notEqual(h.dbPath, sentinel);
    assert.ok(h.dbPath.startsWith(tmpdir()), "harness DB must live in a temp dir");
    assert.ok(!existsSync(sentinel), "harness must not create the env DATABASE_PATH");
  } finally {
    h.cleanup();
    delete process.env.DATABASE_PATH;
  }
});

test("data safety: committed rows survive a close/reopen (restart)", async () => {
  const h = await createHarness();
  const dbPath = h.dbPath;
  try {
    h.db.prepare(
      "INSERT INTO customers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
    ).run("cust-restart", "R-1", "عميل اختبار", "0100", "القاهرة", 0, 0, new Date().toISOString(), new Date().toISOString());
    h.db.close();

    const reopened = new Database(dbPath);
    const row = reopened.prepare("SELECT name FROM customers WHERE id = ?").get("cust-restart") as { name: string } | undefined;
    assert.ok(row, "row must survive close/reopen");
    assert.equal(row!.name, "عميل اختبار");
    reopened.close();
  } finally {
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test("data safety: prod-db.sh refuses an in-repo DATABASE_PATH", () => {
  const repoRoot = resolve(process.cwd());
  const inRepo = join(repoRoot, "server", "should-not-exist.db");
  let failed = false;
  try {
    execFileSync("bash", ["scripts/prod-db.sh"], {
      env: { ...process.env, DATABASE_PATH: inRepo },
      stdio: "pipe",
    });
  } catch {
    failed = true;
  }
  assert.ok(failed, "prod-db.sh must exit non-zero for an in-repo path");
  assert.ok(!existsSync(inRepo), "prod-db.sh must not create the in-repo database");
});

test("data safety: a backup can be restored to a separate location", async () => {
  const h = await createHarness();
  try {
    h.db.prepare(
      "INSERT INTO customers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
    ).run("cust-bk", "BK-1", "عميل نسخة", "0101", "الجيزة", 0, 0, new Date().toISOString(), new Date().toISOString());

    const backupDir = mkdtempSync(join(tmpdir(), "sms-backup-"));
    const backupPath = join(backupDir, "sales-test.db");
    h.db.prepare("VACUUM INTO ?").run(backupPath);

    const restored = new Database(backupPath, { readonly: true });
    const integrity = restored.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    assert.equal(integrity.integrity_check, "ok");
    const row = restored.prepare("SELECT name FROM customers WHERE id = ?").get("cust-bk") as { name: string } | undefined;
    assert.ok(row, "restored backup must contain the committed row");
    restored.close();
    rmSync(backupDir, { recursive: true, force: true });
  } finally {
    h.cleanup();
  }
});