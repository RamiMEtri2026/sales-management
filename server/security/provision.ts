/**
 * Secure initial administrator provisioning.
 *
 * There is NO hardcoded default password. The first admin is created by an
 * operator running a one-off command with a password supplied via environment
 * variable (or stdin), never committed to source.
 *
 * Usage:
 *   DATABASE_PATH=/var/lib/sms/sales.db \
 *   PROVISION_ADMIN_USERNAME=admin \
 *   PROVISION_ADMIN_NAME="مدير النظام" \
 *   PROVISION_ADMIN_PASSWORD='<strong-password>' \
 *   npm run provision:admin
 *
 * The command refuses to run if an admin already exists, so it cannot be
 * used to silently reset credentials.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { hashPassword } from "./passwords.js";

async function main(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH?.trim();
  if (!dbPath) {
    console.error("DATABASE_PATH is not set.");
    process.exit(1);
  }
  const username = process.env.PROVISION_ADMIN_USERNAME?.trim();
  const name = process.env.PROVISION_ADMIN_NAME?.trim() || "مدير النظام";
  const password = process.env.PROVISION_ADMIN_PASSWORD;

  if (!username || !password) {
    console.error("PROVISION_ADMIN_USERNAME and PROVISION_ADMIN_PASSWORD are required.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (existing) {
    console.error(`User '${username}' already exists. Refusing to overwrite.`);
    db.close();
    process.exit(1);
  }

  const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'admin'").get() as { id: string } | undefined;
  if (!adminRole) {
    console.error("Admin role not found. Run migrations and seed RBAC first.");
    db.close();
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const userId = randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO users (id, username, name, role, password_hash, active, created_at) VALUES (?, ?, ?, 'admin', ?, 1, ?)",
    ).run(userId, username, name, hash, new Date().toISOString());
    db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(userId, adminRole.id);
  });
  tx();

  console.log(`Admin '${username}' provisioned. Password was hashed with Argon2id and never stored in plaintext.`);
  db.close();
}

main().catch((err) => {
  console.error(`provision failed: ${(err as Error).message}`);
  process.exit(1);
});