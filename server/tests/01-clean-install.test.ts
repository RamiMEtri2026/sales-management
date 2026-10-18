/**
 * Suite 1 — Clean installation.
 *
 * Asserts that a fresh disposable database can be created, all migrations
 * apply in order, the schema_migrations table records them, the backend
 * starts, and the health endpoint responds without exposing secrets.
 *
 * Run:  node --test server/tests/01-clean-install.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createHarness } from "./harness.js";

test("clean install: migrations apply and are recorded in order", async () => {
  const h = await createHarness();
  try {
    const rows = h.db
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all() as { version: number; name: string }[];
    assert.ok(rows.length > 0, "expected at least one migration to be recorded");
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].version > rows[i - 1].version, "migrations must be strictly increasing");
    }
  } finally {
    h.cleanup();
  }
});

test("clean install: health endpoint responds and leaks nothing", async () => {
  const h = await createHarness();
  try {
    const res = await request(h.app).get("/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { data: { ok: true } });
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes(h.dbPath), "health must not expose the database path");
    assert.ok(!/version|secret|env/i.test(body), "health must not expose version or secrets");
  } finally {
    h.cleanup();
  }
});

test("clean install: protected route rejects unauthenticated access", async () => {
  const h = await createHarness();
  try {
    const res = await request(h.app).get("/api/products");
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "UNAUTHENTICATED");
  } finally {
    h.cleanup();
  }
});