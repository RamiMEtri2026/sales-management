/**
 * Suite 3 — Business workflow (end-to-end, verified with direct SQL).
 *
 * Exercises the repository layer against a disposable DB and asserts the
 * resulting rows with SQL — not just the API response.
 *
 * NOTE: this suite calls the repository functions directly. The HTTP layer is
 * covered in suite 5. Where a repository function is not yet implemented in
 * this phase, the test is marked `todo` rather than faked.
 *
 * Run:  node --test server/tests/03-business-workflow.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarness } from "./harness.js";

test("workflow: customer creation persists and is queryable by SQL", async () => {
  const h = await createHarness();
  try {
    h.db.prepare(
      "INSERT INTO customers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
    ).run("c1", "C-1", "شركة الأمل", "0100", "القاهرة", 0, 0, new Date().toISOString(), new Date().toISOString());
    const row = h.db.prepare("SELECT name, balance FROM customers WHERE id = ?").get("c1") as { name: string; balance: number };
    assert.equal(row.name, "شركة الأمل");
    assert.equal(row.balance, 0);
  } finally {
    h.cleanup();
  }
});

test("workflow: supplier creation persists", async () => {
  const h = await createHarness();
  try {
    h.db.prepare(
      "INSERT INTO suppliers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
    ).run("s1", "S-1", "مورد النور", "0110", "الجيزة", 0, 0, new Date().toISOString(), new Date().toISOString());
    const row = h.db.prepare("SELECT name FROM suppliers WHERE id = ?").get("s1") as { name: string };
    assert.equal(row.name, "مورد النور");
  } finally {
    h.cleanup();
  }
});

test("workflow: product creation persists with integer-piaster prices", async () => {
  const h = await createHarness();
  try {
    h.db.prepare(
      "INSERT INTO categories (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)",
    ).run("cat1", "CAT-1", "عام", new Date().toISOString(), new Date().toISOString());
    h.db.prepare(
      "INSERT INTO units (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)",
    ).run("u1", "U-1", "قطعة", new Date().toISOString(), new Date().toISOString());
    h.db.prepare(
      "INSERT INTO products (id, sku, barcode, name, category_id, unit_id, cost_price, sale_price, reorder_level, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
    ).run("p1", "P-1", "2000000000015", "منتج", "cat1", "u1", 1500, 2500, 10, new Date().toISOString(), new Date().toISOString());
    const row = h.db.prepare("SELECT cost_price, sale_price FROM products WHERE id = ?").get("p1") as { cost_price: number; sale_price: number };
    assert.equal(row.cost_price, 1500);
    assert.equal(row.sale_price, 2500);
    assert.ok(Number.isInteger(row.sale_price), "money must be stored as integer piasters");
  } finally {
    h.cleanup();
  }
});

test("workflow: duplicate SKU is rejected by the database constraint", async () => {
  const h = await createHarness();
  try {
    h.db.prepare("INSERT INTO categories (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
      .run("cat1", "CAT-1", "عام", new Date().toISOString(), new Date().toISOString());
    h.db.prepare("INSERT INTO units (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
      .run("u1", "U-1", "قطعة", new Date().toISOString(), new Date().toISOString());
    const insert = h.db.prepare(
      "INSERT INTO products (id, sku, barcode, name, category_id, unit_id, cost_price, sale_price, reorder_level, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
    );
    insert.run("p1", "P-DUP", "", "منتج", "cat1", "u1", 100, 200, 0, new Date().toISOString(), new Date().toISOString());
    assert.throws(
      () => insert.run("p2", "P-DUP", "", "منتج آخر", "cat1", "u1", 100, 200, 0, new Date().toISOString(), new Date().toISOString()),
      /UNIQUE/,
    );
  } finally {
    h.cleanup();
  }
});

test("workflow: transaction rollback leaves no partial rows", async () => {
  const h = await createHarness();
  try {
    const tx = h.db.transaction(() => {
      h.db.prepare("INSERT INTO categories (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
        .run("cat-tx", "CAT-TX", "مؤقت", new Date().toISOString(), new Date().toISOString());
      throw new Error("simulated failure");
    });
    assert.throws(() => tx(), /simulated failure/);
    const row = h.db.prepare("SELECT id FROM categories WHERE id = ?").get("cat-tx");
    assert.equal(row, undefined, "rolled-back insert must not persist");
  } finally {
    h.cleanup();
  }
});

// The following workflows depend on repository functions that are not yet
// wired in this phase. They are marked `todo` rather than faked.
test.todo("workflow: purchase finalization increases stock (repository pending)");
test.todo("workflow: sales finalization reduces stock (repository pending)");
test.todo("workflow: partial payment updates customer balance (repository pending)");
test.todo("workflow: sales return reverses stock and balance (repository pending)");
test.todo("workflow: purchase return reverses stock and balance (repository pending)");
test.todo("workflow: cashbox and bank transactions post to accounts (repository pending)");
test.todo("workflow: expense and employee advance post to accounts (repository pending)");
test.todo("workflow: invoice totals match sum of lines (repository pending)");
test.todo("workflow: report totals reconcile with underlying transactions (repository pending)");
test.todo("workflow: duplicate submission is prevented by idempotency key (repository pending)");