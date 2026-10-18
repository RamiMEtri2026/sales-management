/**
 * Health-check endpoint.
 *
 * Exposes ONLY liveness. It does not reveal the database path, schema version,
 * environment variables, or any secret. Safe for public liveness probes.
 *
 * A deeper readiness check (which touches the database) is available behind
 * authentication at /api/health/ready and returns only a boolean.
 */

import type { Router } from "express";
import type Database from "better-sqlite3";

export function registerHealth(router: Router, db: Database.Database): void {
  router.get("/health", (_req, res) => {
    res.json({ data: { ok: true } });
  });

  router.get("/health/ready", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ data: { ready: true } });
    } catch {
      res.status(503).json({ data: { ready: false } });
    }
  });
}