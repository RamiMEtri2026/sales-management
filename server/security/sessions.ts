/**
 * Session management.
 *
 * - Session tokens are 32 random bytes, stored hashed (SHA-256) in the DB.
 *   A database leak does not yield usable tokens.
 * - Tokens are delivered as HttpOnly, SameSite=Strict cookies in production.
 * - CSRF: double-submit cookie. A non-HttpOnly `csrf` cookie is set alongside
 *   the session cookie; state-changing requests must echo it in `X-CSRF-Token`.
 * - Sessions expire (default 12h) and are deleted on logout.
 * - Deactivated users cannot authenticate or use existing sessions.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type Database from "better-sqlite3";

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS ?? 1000 * 60 * 60 * 12);
const COOKIE_NAME = "sms.sid";
const CSRF_COOKIE = "sms.csrf";
const COOKIE_SECURE = process.env.NODE_ENV === "production";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  name: string;
  role: string;
  active: number;
}

export function createSession(db: Database.Database, user: SessionUser): { token: string; csrf: string; expiresAt: string } {
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), user.id, new Date().toISOString(), expiresAt);
  return { token, csrf, expiresAt };
}

export function setSessionCookies(res: Response, token: string, csrf: string, expiresAt: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "strict",
    expires: new Date(expiresAt),
    path: "/",
  });
  // CSRF cookie is readable by JS on purpose (double-submit pattern).
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: "strict",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

export function readSessionToken(req: Request): string | null {
  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  if (fromCookie) return fromCookie;
  // Fallback for non-browser clients (e.g. tests) using Authorization header.
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);
  return null;
}

export interface ResolvedSession {
  user: SessionUser;
  expiresAt: string;
}

export function resolveSession(db: Database.Database, token: string): ResolvedSession | null {
  const row = db
    .prepare(
      `SELECT s.expires_at, u.id, u.name, u.role, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(hashToken(token)) as { expires_at: string; id: string; name: string; role: string; active: number } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(hashToken(token));
    return null;
  }
  if (row.active !== 1) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(hashToken(token));
    return null;
  }
  return { user: { id: row.id, name: row.name, role: row.role, active: row.active }, expiresAt: row.expires_at };
}

export function destroySession(db: Database.Database, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(hashToken(token));
}

/** Constant-time CSRF check. */
export function checkCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[CSRF_COOKIE];
  const header = req.headers["x-csrf-token"];
  if (!cookie || typeof header !== "string") return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}