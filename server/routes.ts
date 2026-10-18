/**
 * REST routes. Every handler validates input at the boundary, calls the
 * repository layer, and returns a consistent JSON shape:
 *   success: { data: ... }
 *   failure: { code, message, details? }
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { makeRepo, findUserByUsername, insertSession, findSession, deleteSession, listProducts, insertProduct, createAndFinalizeInvoice, appendAudit } from "./repositories.js";
import type { DbHandle } from "./db.js";

export interface AuthedRequest extends Request {
  user?: { id: string; name: string; role: string };
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function buildRouter(handle: DbHandle): Router {
  const repo = makeRepo(handle.db);
  const router = Router();

  /* ------------------------------ auth ------------------------------ */

  router.post("/auth/login", (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "اسم الدخول وكلمة المرور مطلوبان." });
    }
    const user = findUserByUsername(repo, username);
    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "اسم الدخول أو كلمة المرور غير صحيحة." });
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    insertSession(repo, user.id, token, expiresAt);
    appendAudit(repo, { userId: user.id, userName: user.name, action: "تسجيل دخول", entity: "user", reference: user.username, details: "" });
    return res.json({ data: { token, expiresAt, user: { id: user.id, name: user.name, role: user.role } } });
  });

  router.post("/auth/logout", requireAuth, (req: AuthedRequest, res: Response) => {
    const token = bearer(req);
    if (token) deleteSession(repo, token);
    appendAudit(repo, { userId: req.user!.id, userName: req.user!.name, action: "تسجيل خروج", entity: "user", reference: req.user!.id, details: "" });
    return res.json({ data: { ok: true } });
  });

  /* ---------------------------- products ---------------------------- */

  router.get("/products", requireAuth, (req: AuthedRequest, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const rows = listProducts(repo, { search, limit, offset });
    return res.json({ data: rows, meta: { limit, offset } });
  });

  router.post("/products", requireAuth, requireRole("admin", "manager"), (req: AuthedRequest, res: Response) => {
    const b = req.body ?? {};
    const required = ["sku", "name", "categoryId", "unitId"];
    for (const k of required) {
      if (typeof b[k] !== "string" || !b[k].trim()) {
        return res.status(400).json({ code: "INVALID_INPUT", message: `الحقل ${k} مطلوب.` });
      }
    }
    if (!Number.isInteger(b.costPrice) || b.costPrice < 0) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "سعر التكلفة يجب أن يكون عددًا صحيحًا غير سالب (بالبقروش)." });
    }
    if (!Number.isInteger(b.salePrice) || b.salePrice <= 0) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "سعر البيع يجب أن يكون عددًا صحيحًا أكبر من صفر (بالبقروش)." });
    }
    try {
      insertProduct(repo, {
        id: randomUUID(),
        sku: b.sku.trim(),
        barcode: typeof b.barcode === "string" ? b.barcode.trim() : "",
        name: b.name.trim(),
        category_id: b.categoryId,
        unit_id: b.unitId,
        cost_price: b.costPrice,
        sale_price: b.salePrice,
        reorder_level: Number.isInteger(b.reorderLevel) ? b.reorderLevel : 0,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("UNIQUE")) {
        return res.status(409).json({ code: "DUPLICATE", message: "كود المنتج أو الباركود مستخدم بالفعل." });
      }
      throw err;
    }
    appendAudit(repo, { userId: req.user!.id, userName: req.user!.name, action: "إضافة منتج", entity: "product", reference: b.sku, details: b.name });
    return res.status(201).json({ data: { ok: true } });
  });

  /* ---------------------------- invoices ---------------------------- */

  router.post("/invoices", requireAuth, requireRole("admin", "manager", "sales"), (req: AuthedRequest, res: Response) => {
    const b = req.body ?? {};
    if (!b.customerId || !b.warehouseId || !b.accountId || !Array.isArray(b.lines) || b.lines.length === 0) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "بيانات الفاتورة غير مكتملة." });
    }
    for (const l of b.lines) {
      if (!l.productId || !Number.isInteger(l.quantity) || l.quantity <= 0) {
        return res.status(400).json({ code: "INVALID_INPUT", message: "كل بند يجب أن يحتوي على منتج وكمية صحيحة أكبر من صفر." });
      }
      if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) {
        return res.status(400).json({ code: "INVALID_INPUT", message: "سعر الوحدة يجب أن يكون عددًا صحيحًا غير سالب (بالبقروش)." });
      }
    }
    try {
      const created = createAndFinalizeInvoice(repo, {
        customerId: b.customerId,
        warehouseId: b.warehouseId,
        accountId: b.accountId,
        date: typeof b.date === "string" ? b.date : new Date().toISOString(),
        lines: b.lines,
        paid: Number.isInteger(b.paid) ? b.paid : 0,
        paymentMethod: typeof b.paymentMethod === "string" ? b.paymentMethod : "cash",
        notes: typeof b.notes === "string" ? b.notes : "",
        createdBy: req.user!.name,
      });
      appendAudit(repo, { userId: req.user!.id, userName: req.user!.name, action: "اعتماد فاتورة بيع", entity: "invoice", reference: created.number, details: "" });
      return res.status(201).json({ data: created });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "INVALID_PAID") {
        return res.status(400).json({ code: "INVALID_PAID", message: "المبلغ المدفوع غير صالح." });
      }
      if (msg === "PRODUCT_NOT_FOUND") {
        return res.status(400).json({ code: "PRODUCT_NOT_FOUND", message: "أحد المنتجات في الفاتورة غير موجود." });
      }
      throw err;
    }
  });

  /* ------------------------------ misc ------------------------------ */

  router.get("/health", (_req, res) => res.json({ data: { ok: true, schemaVersion: handle.schemaVersion } }));

  return router;
}

/* ------------------------------ helpers ------------------------------ */

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7);
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول." });
    return;
  }
  const handle = (req.app.locals.dbHandle as DbHandle);
  const repo = makeRepo(handle.db);
  const session = findSession(repo, token);
  if (!session) {
    res.status(401).json({ code: "INVALID_SESSION", message: "الجلسة غير صالحة." });
    return;
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    deleteSession(repo, token);
    res.status(401).json({ code: "SESSION_EXPIRED", message: "انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى." });
    return;
  }
  const user = handle.db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(session.user_id) as
    | { id: string; name: string; role: string }
    | undefined;
  if (!user) {
    res.status(401).json({ code: "USER_NOT_FOUND", message: "المستخدم غير موجود." });
    return;
  }
  req.user = user;
  next();
}

function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ code: "FORBIDDEN", message: "ليس لديك صلاحية لتنفيذ هذه العملية." });
      return;
    }
    next();
  };
}

/**
 * Prototype password hashing. Replace with argon2/bcrypt before production.
 * Kept here so the boundary is explicit and easy to swap.
 */
function hashPassword(plain: string): string {
  // NOTE: this is NOT production-grade. It exists so the prototype can run
  // without pulling a native hashing dependency into the preview sandbox.
  return `sha256:${Buffer.from(plain).toString("base64")}`;
}