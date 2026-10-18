/**
 * Security headers and CORS.
 *
 * - CORS is restricted to an explicit allowlist from CORS_ORIGINS (comma-separated).
 *   No wildcard in production.
 * - Sets CSP, HSTS (production only), X-Content-Type-Options, X-Frame-Options,
 *   Referrer-Policy, and Permissions-Policy.
 * - Never serves the SQLite file: the API router only exposes JSON routes.
 */

import type { Request, Response, NextFunction } from "express";

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allow = allowedOrigins();
  if (origin && allow.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}