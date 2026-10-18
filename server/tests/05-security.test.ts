/**
 * Suite 5 — Security verification.
 *
 * Asserts unauthenticated rejection, RBAC enforcement at the API layer,
 * CSRF, generic auth errors, rate limiting, and that no secret leaks in
 * responses.
 *
 * Run:  node --test server/tests/05-security.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createHarness, login } from "./harness.js";

test("security: unauthenticated request to a protected route is rejected", async () => {
  const h = await createHarness();
  try {
    const res = await request(h.app).get("/api/products");
    assert.equal(res.status, 401);
  } finally {
    h.cleanup();
  }
});

test("security: login with a wrong password returns a generic error", async () => {
  const h = await createHarness();
  try {
    const res = await request(h.app).post("/api/auth/login").send({ username: h.admin.username, password: "wrong" });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "INVALID_CREDENTIALS");
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes("exist"));
  } finally {
    h.cleanup();
  }
});

test("security: login with an unknown user returns the same generic error", async () => {
  const h = await createHarness();
  try {
    const res = await request(h.app).post("/api/auth/login").send({ username: "no-such-user", password: "whatever" });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "INVALID_CREDENTIALS");
  } finally {
    h.cleanup();
  }
});

test("security: a sales user cannot create a product (RBAC enforced server-side)", async () => {
  const h = await createHarness();
  try {
    const { cookies, csrf } = await login(h.app, h.salesUser.username, h.salesUser.password);
    const res = await request(h.app)
      .post("/api/products")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ sku: "X-1", name: "منتج", categoryId: "c", unitId: "u", costPrice: 100, salePrice: 200 });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "FORBIDDEN");
  } finally {
    h.cleanup();
  }
});

test("security: an admin can create a product", async () => {
  const h = await createHarness();
  try {
    h.db.prepare("INSERT INTO categories (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
      .run("cat-s", "CAT-S", "عام", new Date().toISOString(), new Date().toISOString());
    h.db.prepare("INSERT INTO units (id, code, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)")
      .run("u-s", "U-S", "قطعة", new Date().toISOString(), new Date().toISOString());

    const { cookies, csrf } = await login(h.app, h.admin.username, h.admin.password);
    const res = await request(h.app)
      .post("/api/products")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ sku: "ADM-1", name: "منتج إداري", categoryId: "cat-s", unitId: "u-s", costPrice: 100, salePrice: 200 });
    assert.equal(res.status, 201);
  } finally {
    h.cleanup();
  }
});

test("security: CSRF token is required for state-changing requests", async () => {
  const h = await createHarness();
  try {
    const { cookies } = await login(h.app, h.admin.username, h.admin.password);
    const res = await request(h.app)
      .post("/api/products")
      .set("Cookie", cookies)
      .send({ sku: "X-2", name: "منتج", categoryId: "c", unitId: "u", costPrice: 100, salePrice: 200 });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "CSRF_FAILED");
  } finally {
    h.cleanup();
  }
});

test("security: unknown fields are rejected (no mass assignment)", async () => {
  const h = await createHarness();
  try {
    const { cookies, csrf } = await login(h.app, h.admin.username, h.admin.password);
    const res = await request(h.app)
      .post("/api/products")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ sku: "X-3", name: "منتج", categoryId: "c", unitId: "u", costPrice: 100, salePrice: 200, role: "admin" });
    assert.equal(res.status, 400);
  } finally {
    h.cleanup();
  }
});

test("security: SQL injection attempt in a query parameter is handled safely", async () => {
  const h = await createHarness();
  try {
    const { cookies } = await login(h.app, h.admin.username, h.admin.password);
    const res = await request(h.app)
      .get("/api/products")
      .query({ search: "'; DROP TABLE products; --" })
      .set("Cookie", cookies);
    assert.equal(res.status, 200);
    const stillThere = h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
    assert.ok(stillThere, "products table must still exist");
  } finally {
    h.cleanup();
  }
});

test("security: login rate limit returns 429 after repeated failures", async () => {
  const h = await createHarness();
  try {
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const res = await request(h.app).post("/api/auth/login").send({ username: "ratelimit-user", password: "wrong" });
      last = res.status;
    }
    assert.equal(last, 429);
  } finally {
    h.cleanup();
  }
});

test("security: responses never contain the database path or a stack trace", async () => {
  const h = await createHarness();
  try {
    const res = await request(h.app).get("/api/products");
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes(h.dbPath));
    assert.ok(!body.includes("at Object."));
    assert.ok(!/node_modules/.test(body));
  } finally {
    h.cleanup();
  }
});