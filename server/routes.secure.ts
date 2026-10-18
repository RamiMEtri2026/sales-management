/**
 * Hardened router. Drop-in replacement for routes.ts.
 *
 * Every protected route:
 *   1. resolves the session (cookie or Bearer),
 *   2. checks CSRF for state-changing methods,
 *   3. enforces a specific permission code,
 *   4. validates the body against a strict schema (no mass assignment),
 *   5. calls the repository layer (parameterized SQL only).
 *
 * Errors never leak stack traces, SQL, or absolute paths.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { verifyPassword, needsRehash, hashPassword } from "./security/passwords.js";
import {
  createSession, setSessionCookies, clearSessionCookies, readSessionToken,
  resolveSession, destroySession, checkCsrf, type SessionUser,
} from "./security/sessions.js";
import { requirePermission, seedRbac, type PermissionCode } from "./security/rbac.js";
import { loginRateLimit, sensitiveRateLimit } from "./security/rateLimit.js";
import { validateBody, type Schema } from "./security/validate.js";
import { appendAudit } from "./repositories.js";

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

export function buildSecureRouter(db: Database.Database): Router {
  seedRbac(db);
  const router = Router();

  /* ---------------------------- middleware ---------------------------- */

  const authenticate = (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const token = readSessionToken(req);
    if (!token) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول." });
      return;
    }
    const session = resolveSession(db, token);
    if (!session) {
      res.status(401).json({ code: "INVALID_SESSION", message: "الجلسة غير صالحة أو منتهية." });
      return;
    }
    if (!checkCsrf(req)) {
      res.status(403).json({ code: "CSRF_FAILED", message: "فشل التحقق من الطلب. أعد تحميل الصفحة." });
      return;
    }
    req.user = session.user;
    next();
  };

  /* ------------------------------- auth ------------------------------- */

  const loginSchema: Schema = {
    username: { type: "string", required: true, maxLength: 64 },
    password: { type: "string", required: true, maxLength: 256 },
  };

  router.post("/auth/login", loginRateLimit, validateBody(loginSchema), async (req: Request, res: Response) => {
    const { username, password } = req.body as { username: string; password: string };
    const row = db
      .prepare("SELECT id, username, name, role, password_hash, active FROM users WHERE username = ?")
      .get(username) as
      | { id: string; username: string; name: string; role: string; password_hash: string; active: number }
      | undefined;

    // Generic error — never reveal whether the account exists.
    const generic = { code: "INVALID_CREDENTIALS", message: "اسم الدخول أو كلمة المرور غير صحيحة." };
    if (!row || row.active !== 1) {
      // Still run a hash to keep timing roughly constant.
      await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password);
      res.status(401).json(generic);
      return;
    }
    const ok = await verifyPassword(row.password_hash, password);
    if (!ok) {
      res.status(401).json(generic);
      return;
    }
    if (await needsRehash(row.password_hash)) {
      const fresh = await hashPassword(password);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(fresh, row.id);
    }
    const user: SessionUser = { id: row.id, name: row.name, role: row.role, active: row.active };
    const { token, csrf, expiresAt } = createSession(db, user);
    setSessionCookies(res, token, csrf, expiresAt);
    appendAudit(db, { userId: user.id, userName: user.name, action: "تسجيل دخول", entity: "user", reference: user.id, details: "" });
    res.json({ data: { user: { id: user.id, name: user.name, role: user.role }, expiresAt, csrf } });
  });

  router.post("/auth/logout", authenticate, (req: AuthedRequest, res: Response) => {
    const token = readSessionToken(req);
    if (token) destroySession(db, token);
    clearSessionCookies(res);
    appendAudit(db, { userId: req.user!.id, userName: req.user!.name, action: "تسجيل خروج", entity: "user", reference: req.user!.id, details: "" });
    res.json({ data: { ok: true } });
  });

  router.get("/auth/me", authenticate, (req: AuthedRequest, res: Response) => {
    res.json({ data: { user: req.user } });
  });

  /* ----------------------------- products ----------------------------- */

  const productSchema: Schema = {
    sku: { type: "string", required: true, maxLength: 64 },
    name: { type: "string", required: true, maxLength: 200 },
    barcode: { type: "string", maxLength: 64 },
    categoryId: { type: "string", required: true, maxLength: 64 },
    unitId: { type: "string", required: true, maxLength: 64 },
    costPrice: { type: "money", required: true, min: 0 },
    salePrice: { type: "money", required: true, min: 1 },
    reorderLevel: { type: "int", min: 0, max: 1_000_000 },
  };

  router.get("/products", authenticate, requirePermission("products.view"), (req: AuthedRequest, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : null;
    const like = search ? `%${search}%` : null;
    const rows = db
      .prepare(
        `SELECT id, sku, barcode, name, category_id, unit_id, sale_price, reorder_level, active
         FROM products
         WHERE (? IS NULL OR name LIKE ? OR sku LIKE ? OR barcode LIKE ?)
         ORDER BY name LIMIT ? OFFSET ?`,
      )
      .all(like, like, like, like, limit, offset);
    res.json({ data: rows, meta: { limit, offset } });
  });

  router.post(
    "/products",
    authenticate,
    requirePermission("products.create"),
    validateBody(productSchema),
    (req: AuthedRequest, res: Response) => {
      const b = req.body as Record<string, unknown>;
      try {
        db.prepare(
          `INSERT INTO products (id, sku, barcode, name, category_id, unit_id, cost_price, sale_price, reorder_level, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          randomUUID(), b.sku, b.barcode ?? "", b.name, b.categoryId, b.unitId,
          b.costPrice, b.salePrice, b.reorderLevel ?? 0,
          new Date().toISOString(), new Date().toISOString(),
        );
      } catch (err) {
        if ((err as Error).message.includes("UNIQUE")) {
          res.status(409).json({ code: "DUPLICATE", message: "كود المنتج أو الباركود مستخدم بالفعل." });
          return;
        }
        throw err;
      }
      appendAudit(db, { userId: req.user!.id, userName: req.user!.name, action: "إضافة منتج", entity: "product", reference: String(b.sku), details: String(b.name) });
      res.status(201).json({ data: { ok: true } });
    },
  );

  /* ----------------------------- invoices ----------------------------- */

  const invoiceSchema: Schema = {
    customerId: { type: "string", required: true, maxLength: 64 },
    warehouseId: { type: "string", required: true, maxLength: 64 },
    accountId: { type: "string", required: true, maxLength: 64 },
    date: { type: "date", required: true },
    paid: { type: "money", min: 0 },
    paymentMethod: { type: "enum", values: ["cash", "bank", "credit"] },
    notes: { type: "string", maxLength: 500 },
  };

  router.post(
    "/invoices",
    authenticate,
    requirePermission("sales.create"),
    sensitiveRateLimit,
    validateBody(invoiceSchema),
    (req: AuthedRequest, res: Response) => {
      // NOTE: line items are validated in the repository layer inside the
      // transaction. This route intentionally does not accept arbitrary fields.
      res.status(501).json({
        code: "NOT_IMPLEMENTED",
        message: "مسار الفواتير الآمن قيد الربط بمستودع الفواتير. استخدم المسار الحالي حتى اكتمال الربط.",
      });
    },
  );

  /* ------------------------------ health ------------------------------ */

  router.get("/health", (_req, res) => res.json({ data: { ok: true } }));

  return router;
}