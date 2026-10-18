/**
 * Test harness.
 *
 * Creates a DISPOSABLE SQLite database in a temp directory, applies all
 * migrations, seeds RBAC, provisions a test admin, and returns a running
 * Express app plus a small HTTP client.
 *
 * It NEVER touches DATABASE_PATH from the environment. Production data is
 * unreachable from this harness by construction.
 *
 * Requires (on a real host, not in the preview sandbox):
 *   - node --test (Node 20+)
 *   - better-sqlite3, express, cookie-parser, supertest
 */

import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { buildSecureRouter } from "../routes.secure.js";
import { seedRbac } from "../security/rbac.js";
import { hashPassword } from "../security/passwords.js";
import { randomUUID } from "node:crypto";

export interface Harness {
  app: Express;
  db: Database.Database;
  dbPath: string;
  dir: string;
  admin: { username: string; password: string; id: string };
  salesUser: { username: string; password: string; id: string };
  cleanup: () => void;
}

const MIGRATIONS_DIR = resolve(process.cwd(), "server/migrations");

function applyMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const version = Number(f.split("_")[0]);
    const already = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version);
    if (already) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        version, f, new Date().toISOString(),
      );
    });
    tx();
  }
}

async function provisionUser(
  db: Database.Database,
  username: string,
  password: string,
  roleCode: string,
): Promise<string> {
  const id = randomUUID();
  const hash = await hashPassword(password);
  const role = db.prepare("SELECT id FROM roles WHERE code = ?").get(roleCode) as { id: string } | undefined;
  if (!role) throw new Error(`role ${roleCode} missing`);
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO users (id, username, name, role, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
    ).run(id, username, username, roleCode, hash, new Date().toISOString());
    db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(id, role.id);
  });
  tx();
  return id;
}

export async function createHarness(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "sms-test-"));
  const dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  applyMigrations(db);
  seedRbac(db);

  const admin = { username: "test-admin", password: "Test-Admin-Pass-123!", id: "" };
  const salesUser = { username: "test-sales", password: "Test-Sales-Pass-123!", id: "" };
  admin.id = await provisionUser(db, admin.username, admin.password, "admin");
  salesUser.id = await provisionUser(db, salesUser.username, salesUser.password, "sales");

  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.locals.db = db;
  app.use("/api", buildSecureRouter(db));

  return {
    app, db, dbPath, dir, admin, salesUser,
    cleanup: () => {
      try { db.close(); } catch { /* ignore */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

/** Log in and return cookies + CSRF token for subsequent requests. */
export async function login(
  app: Express,
  username: string,
  password: string,
): Promise<{ cookies: string[]; csrf: string }> {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookies = (setCookie ?? []).map((c) => c.split(";")[0]);
  const csrf = (res.body?.data?.csrf as string) ?? "";
  return { cookies, csrf };
}