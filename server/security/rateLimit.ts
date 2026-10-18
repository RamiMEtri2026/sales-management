/**
 * Rate limiting for login and sensitive endpoints.
 *
 * - In-memory store is fine for a single-process deployment. For multi-process
 *   or multi-host deployments, swap the store for Redis (documented in
 *   SECURITY.md).
 * - Login: 5 attempts per 15 minutes per IP+username.
 * - Sensitive endpoints (finalize, cancel, reverse, approve, export):
 *   30 requests per minute per user.
 * - Returns 429 with a generic Arabic message.
 */

import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

class MemoryStore {
  private buckets = new Map<string, Bucket>();
  hit(key: string, windowMs: number, max: number): { allowed: boolean; retryAfter: number } {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    if (b.count >= max) {
      return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
    }
    b.count++;
    return { allowed: true, retryAfter: 0 };
  }
  sweep(): void {
    const now = Date.now();
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

const store = new MemoryStore();
setInterval(() => store.sweep(), 60_000).unref?.();

function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.ip ?? "unknown";
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const key = `login:${clientIp(req)}:${username}`;
  const { allowed, retryAfter } = store.hit(key, 15 * 60 * 1000, 5);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ code: "RATE_LIMITED", message: "محاولات دخول كثيرة. حاول لاحقًا." });
    return;
  }
  next();
}

export function sensitiveRateLimit(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id: string } }).user;
  const key = `sensitive:${user?.id ?? clientIp(req)}`;
  const { allowed, retryAfter } = store.hit(key, 60 * 1000, 30);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ code: "RATE_LIMITED", message: "عدد الطلبات كبير. حاول بعد قليل." });
    return;
  }
  next();
}