/**
 * Repository layer. All SQL lives here, always parameterized.
 * Business rules that touch multiple tables run inside db.transaction().
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface Repo {
  db: Database.Database;
}

export function makeRepo(db: Database.Database): Repo {
  return { db };
}

/* ------------------------------- users ------------------------------- */

export interface UserRow {
  id: string;
  username: string;
  name: string;
  role: string;
  password_hash: string;
  active: number;
  created_at: string;
}

export function findUserByUsername(repo: Repo, username: string): UserRow | undefined {
  return repo.db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(username) as UserRow | undefined;
}

export function insertSession(repo: Repo, userId: string, token: string, expiresAt: string): void {
  repo.db
    .prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, new Date().toISOString(), expiresAt);
}

export function findSession(repo: Repo, token: string): { user_id: string; expires_at: string } | undefined {
  return repo.db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(token) as
    | { user_id: string; expires_at: string }
    | undefined;
}

export function deleteSession(repo: Repo, token: string): void {
  repo.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/* ------------------------------ products ----------------------------- */

export interface ProductRow {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category_id: string;
  unit_id: string;
  cost_price: number;
  sale_price: number;
  reorder_level: number;
  active: number;
}

export function listProducts(repo: Repo, opts: { search?: string; limit: number; offset: number }): ProductRow[] {
  const like = opts.search ? `%${opts.search}%` : null;
  return repo.db
    .prepare(
      `SELECT * FROM products
       WHERE (? IS NULL OR name LIKE ? OR sku LIKE ? OR barcode LIKE ?)
       ORDER BY name
       LIMIT ? OFFSET ?`,
    )
    .all(like, like, like, like, opts.limit, opts.offset) as ProductRow[];
}

export function insertProduct(repo: Repo, p: Omit<ProductRow, "active">): void {
  repo.db
    .prepare(
      `INSERT INTO products (id, sku, barcode, name, category_id, unit_id, cost_price, sale_price, reorder_level, active)
       VALUES (@id, @sku, @barcode, @name, @category_id, @unit_id, @cost_price, @sale_price, @reorder_level, 1)`,
    )
    .run(p);
}

/* ------------------------------ invoices ----------------------------- */

export interface InvoiceLineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxPercent: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  warehouseId: string;
  accountId: string;
  date: string;
  lines: InvoiceLineInput[];
  paid: number;
  paymentMethod: string;
  notes: string;
  createdBy: string;
}

export interface CreatedInvoice {
  id: string;
  number: string;
  total: number;
}

/**
 * Create + finalize a sales invoice atomically:
 *   - insert invoice + lines
 *   - deduct stock (one movement per line)
 *   - update customer balance
 *   - post cash movement for the paid amount
 * Any failure rolls the whole thing back.
 */
export function createAndFinalizeInvoice(repo: Repo, input: CreateInvoiceInput): CreatedInvoice {
  const tx = repo.db.transaction((data: CreateInvoiceInput): CreatedInvoice => {
    const subtotal = data.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const discountTotal = data.lines.reduce((s, l) => s + l.discount, 0);
    const taxTotal = data.lines.reduce(
      (s, l) => s + Math.round(((l.unitPrice * l.quantity - l.discount) * l.taxPercent) / 100),
      0,
    );
    const total = subtotal - discountTotal + taxTotal;
    if (data.paid < 0 || data.paid > total) throw new Error("INVALID_PAID");

    const id = randomUUID();
    const number = `INV-${Date.now()}`;
    repo.db
      .prepare(
        `INSERT INTO invoices (id, number, date, customer_id, warehouse_id, status,
           subtotal, discount_total, tax_total, total, paid, payment_method, account_id, notes, created_by, finalized_at)
         VALUES (?, ?, ?, ?, ?, 'finalized', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        number,
        data.date,
        data.customerId,
        data.warehouseId,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        data.paid,
        data.paymentMethod,
        data.accountId,
        data.notes,
        data.createdBy,
        new Date().toISOString(),
      );

    const insertLine = repo.db.prepare(
      `INSERT INTO invoice_lines (id, invoice_id, product_id, product_name, unit_id, quantity, unit_price, discount, tax_percent, returned_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    const insertMovement = repo.db.prepare(
      `INSERT INTO stock_movements (id, date, product_id, warehouse_id, qty, type, reference, reason, created_by)
       VALUES (?, ?, ?, ?, ?, 'sale', ?, ?, ?)`,
    );
    for (const l of data.lines) {
      const prod = repo.db.prepare("SELECT name, unit_id FROM products WHERE id = ?").get(l.productId) as
        | { name: string; unit_id: string }
        | undefined;
      if (!prod) throw new Error("PRODUCT_NOT_FOUND");
      insertLine.run(randomUUID(), id, l.productId, prod.name, prod.unit_id, l.quantity, l.unitPrice, l.discount, l.taxPercent);
      insertMovement.run(randomUUID(), data.date, l.productId, data.warehouseId, -l.quantity, number, `بيع ${number}`, data.createdBy);
    }

    repo.db
      .prepare("UPDATE customers SET balance = balance + ? WHERE id = ?")
      .run(total - data.paid, data.customerId);

    if (data.paid > 0) {
      repo.db
        .prepare(
          `INSERT INTO cash_movements (id, date, type, amount, reference, note, account_id, created_by)
           VALUES (?, ?, 'sale', ?, ?, ?, ?, ?)`,
        )
        .run(randomUUID(), data.date, data.paid, number, `تحصيل فاتورة ${number}`, data.accountId, data.createdBy);
    }

    return { id, number, total };
  });

  return tx(input);
}

/* ------------------------------ audit -------------------------------- */

export function appendAudit(
  repo: Repo,
  entry: { userId: string; userName: string; action: string; entity: string; reference: string; details: string },
): void {
  repo.db
    .prepare(
      `INSERT INTO audit_log (id, at, user_id, user_name, action, entity, reference, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), new Date().toISOString(), entry.userId, entry.userName, entry.action, entry.entity, entry.reference, entry.details);
}