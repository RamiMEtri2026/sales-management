-- Migration 002 — normalized schema for the Sales Management System.
-- Extends (does not replace) the v1 tables from Phase 8.
-- All money = INTEGER piasters. All timestamps = ISO-8601 UTC strings.
-- Business dates = 'YYYY-MM-DD'.
-- This migration is additive and idempotent (IF NOT EXISTS everywhere).

-- ============================ RBAC ============================

CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id         TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id  TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ====================== CATEGORIES / UNITS ======================

-- categories and units already exist in v1; add timestamps + legacy id.
ALTER TABLE categories ADD COLUMN created_at TEXT;
ALTER TABLE categories ADD COLUMN updated_at TEXT;
ALTER TABLE categories ADD COLUMN legacy_id  TEXT;

ALTER TABLE units ADD COLUMN created_at TEXT;
ALTER TABLE units ADD COLUMN updated_at TEXT;
ALTER TABLE units ADD COLUMN legacy_id  TEXT;

-- ============================ PRODUCTS ==========================

ALTER TABLE products ADD COLUMN created_at TEXT;
ALTER TABLE products ADD COLUMN updated_at TEXT;
ALTER TABLE products ADD COLUMN legacy_id  TEXT;
ALTER TABLE products ADD COLUMN brand      TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_products_legacy ON products(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_barcode ON products(barcode) WHERE barcode <> '';

-- ========================= CUSTOMERS / SUPPLIERS ================

ALTER TABLE customers ADD COLUMN created_at TEXT;
ALTER TABLE customers ADD COLUMN updated_at TEXT;
ALTER TABLE customers ADD COLUMN legacy_id  TEXT;
ALTER TABLE customers ADD COLUMN tax_number TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_legacy ON customers(legacy_id) WHERE legacy_id IS NOT NULL;

ALTER TABLE suppliers ADD COLUMN created_at TEXT;
ALTER TABLE suppliers ADD COLUMN updated_at TEXT;
ALTER TABLE suppliers ADD COLUMN legacy_id  TEXT;
ALTER TABLE suppliers ADD COLUMN tax_number TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_legacy ON suppliers(legacy_id) WHERE legacy_id IS NOT NULL;

-- ============================ ACCOUNTS ==========================

ALTER TABLE accounts ADD COLUMN created_at TEXT;
ALTER TABLE accounts ADD COLUMN updated_at TEXT;
ALTER TABLE accounts ADD COLUMN legacy_id  TEXT;
ALTER TABLE accounts ADD COLUMN bank_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN iban       TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_legacy ON accounts(legacy_id) WHERE legacy_id IS NOT NULL;

-- ======================== STOCK MOVEMENTS =======================

ALTER TABLE stock_movements ADD COLUMN legacy_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_legacy ON stock_movements(legacy_id) WHERE legacy_id IS NOT NULL;

-- ============================ INVOICES ==========================

ALTER TABLE invoices ADD COLUMN legacy_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_legacy ON invoices(legacy_id) WHERE legacy_id IS NOT NULL;

-- Historical tax snapshot per invoice (so later tax-rule edits never
-- rewrite past invoices).
CREATE TABLE IF NOT EXISTS invoice_taxes (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_code      TEXT NOT NULL,
  tax_name      TEXT NOT NULL,
  rate_percent  REAL NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  base_amount   INTEGER NOT NULL,
  tax_amount    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_taxes_invoice ON invoice_taxes(invoice_id);

-- ======================= SALES RETURNS ==========================

CREATE TABLE IF NOT EXISTS sales_returns (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,
  date           TEXT NOT NULL,
  invoice_id     TEXT NOT NULL REFERENCES invoices(id),
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  reason         TEXT NOT NULL,
  restock        INTEGER NOT NULL DEFAULT 1 CHECK (restock IN (0,1)),
  refund_account TEXT NOT NULL REFERENCES accounts(id),
  total          INTEGER NOT NULL CHECK (total >= 0),
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  legacy_id      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_returns_legacy ON sales_returns(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id);

CREATE TABLE IF NOT EXISTS sales_return_lines (
  id              TEXT PRIMARY KEY,
  return_id       TEXT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id),
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      INTEGER NOT NULL CHECK (unit_price >= 0),
  amount          INTEGER NOT NULL CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_return ON sales_return_lines(return_id);

-- ====================== PURCHASE INVOICES =======================

CREATE TABLE IF NOT EXISTS purchases (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,
  date           TEXT NOT NULL,
  supplier_id    TEXT NOT NULL REFERENCES suppliers(id),
  warehouse_id   TEXT NOT NULL REFERENCES warehouses(id),
  supplier_ref   TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL CHECK (status IN ('draft','finalized','cancelled')),
  subtotal       INTEGER NOT NULL CHECK (subtotal >= 0),
  discount_total INTEGER NOT NULL CHECK (discount_total >= 0),
  tax_total      INTEGER NOT NULL CHECK (tax_total >= 0),
  total          INTEGER NOT NULL CHECK (total >= 0),
  paid           INTEGER NOT NULL DEFAULT 0 CHECK (paid >= 0),
  payment_method TEXT NOT NULL,
  account_id     TEXT NOT NULL REFERENCES accounts(id),
  notes          TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  finalized_at   TEXT,
  legacy_id      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchases_legacy ON purchases(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id            TEXT PRIMARY KEY,
  purchase_id   TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id),
  product_name  TEXT NOT NULL,
  unit_id       TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    INTEGER NOT NULL CHECK (unit_price >= 0),
  discount      INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_percent   REAL NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100),
  returned_qty  INTEGER NOT NULL DEFAULT 0 CHECK (returned_qty >= 0)
);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_purchase ON purchase_lines(purchase_id);

-- ====================== PURCHASE RETURNS ========================

CREATE TABLE IF NOT EXISTS purchase_returns (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,
  date           TEXT NOT NULL,
  purchase_id    TEXT NOT NULL REFERENCES purchases(id),
  supplier_id    TEXT NOT NULL REFERENCES suppliers(id),
  reason         TEXT NOT NULL,
  restock        INTEGER NOT NULL DEFAULT 1 CHECK (restock IN (0,1)),
  refund_account TEXT NOT NULL REFERENCES accounts(id),
  total          INTEGER NOT NULL CHECK (total >= 0),
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  legacy_id      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_returns_legacy ON purchase_returns(legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id           TEXT PRIMARY KEY,
  return_id    TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   INTEGER NOT NULL CHECK (unit_price >= 0),
  amount       INTEGER NOT NULL CHECK (amount >= 0)
);

-- ====================== STOCK TRANSFERS =========================

CREATE TABLE IF NOT EXISTS stock_transfers (
  id                  TEXT PRIMARY KEY,
  number              TEXT NOT NULL UNIQUE,
  date                TEXT NOT NULL,
  from_warehouse_id   TEXT NOT NULL REFERENCES warehouses(id),
  to_warehouse_id     TEXT NOT NULL REFERENCES warehouses(id),
  status              TEXT NOT NULL CHECK (status IN ('draft','completed','cancelled')),
  notes               TEXT NOT NULL DEFAULT '',
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  completed_at        TEXT,
  legacy_id           TEXT,
  CHECK (from_warehouse_id <> to_warehouse_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_transfers_legacy ON stock_transfers(legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id           TEXT PRIMARY KEY,
  transfer_id  TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0)
);

-- ====================== STOCK ADJUSTMENTS =======================

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id           TEXT PRIMARY KEY,
  number       TEXT NOT NULL UNIQUE,
  date         TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  product_id   TEXT NOT NULL REFERENCES products(id),
  qty          INTEGER NOT NULL CHECK (qty <> 0),
  reason       TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  legacy_id    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_adjustments_legacy ON stock_adjustments(legacy_id) WHERE legacy_id IS NOT NULL;

-- ==================== VOUCHERS / TRANSFERS ======================

CREATE TABLE IF NOT EXISTS vouchers (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL CHECK (kind IN ('receipt','payment')),
  subtype        TEXT NOT NULL,
  date           TEXT NOT NULL,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  account_id     TEXT NOT NULL REFERENCES accounts(id),
  payment_method TEXT NOT NULL,
  party_id       TEXT,
  party_name     TEXT NOT NULL DEFAULT '',
  related_ref    TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('posted','reversed')),
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  reversed_at    TEXT,
  legacy_id      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vouchers_legacy ON vouchers(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_account ON vouchers(account_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);

CREATE TABLE IF NOT EXISTS account_transfers (
  id                TEXT PRIMARY KEY,
  number            TEXT NOT NULL UNIQUE,
  date              TEXT NOT NULL,
  from_account_id   TEXT NOT NULL REFERENCES accounts(id),
  to_account_id     TEXT NOT NULL REFERENCES accounts(id),
  amount            INTEGER NOT NULL CHECK (amount > 0),
  description       TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  legacy_id         TEXT,
  CHECK (from_account_id <> to_account_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_transfers_legacy ON account_transfers(legacy_id) WHERE legacy_id IS NOT NULL;

-- ==================== EXPENSES / INCOMES ========================

CREATE TABLE IF NOT EXISTS expense_categories (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  legacy_id  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_categories_legacy ON expense_categories(legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  number        TEXT NOT NULL UNIQUE,
  date          TEXT NOT NULL,
  category_id   TEXT NOT NULL REFERENCES expense_categories(id),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  description   TEXT NOT NULL,
  reference     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL CHECK (status IN ('posted','reversed')),
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  reversed_at   TEXT,
  legacy_id     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_expenses_legacy ON expenses(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

CREATE TABLE IF NOT EXISTS incomes (
  id           TEXT PRIMARY KEY,
  number       TEXT NOT NULL UNIQUE,
  date         TEXT NOT NULL,
  category     TEXT NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  description  TEXT NOT NULL,
  reference    TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL CHECK (status IN ('posted','reversed')),
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  reversed_at  TEXT,
  legacy_id    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_incomes_legacy ON incomes(legacy_id) WHERE legacy_id IS NOT NULL;

-- ==================== EMPLOYEES / PAYROLL =======================

CREATE TABLE IF NOT EXISTS employees (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  position    TEXT NOT NULL,
  department  TEXT NOT NULL DEFAULT '',
  salary      INTEGER NOT NULL CHECK (salary >= 0),
  join_date   TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  legacy_id   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_legacy ON employees(legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS salary_records (
  id           TEXT PRIMARY KEY,
  number       TEXT NOT NULL UNIQUE,
  employee_id  TEXT NOT NULL REFERENCES employees(id),
  period       TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  base_salary  INTEGER NOT NULL CHECK (base_salary >= 0),
  allowances   INTEGER NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  deductions   INTEGER NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net          INTEGER NOT NULL CHECK (net >= 0),
  notes        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL CHECK (status IN ('pending','paid')),
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  paid_at      TEXT,
  legacy_id    TEXT,
  UNIQUE (employee_id, period)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_salary_records_legacy ON salary_records(legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS salary_payments (
  id                TEXT PRIMARY KEY,
  number            TEXT NOT NULL UNIQUE,
  salary_record_id  TEXT NOT NULL REFERENCES salary_records(id),
  employee_id       TEXT NOT NULL REFERENCES employees(id),
  amount            INTEGER NOT NULL CHECK (amount > 0),
  account_id        TEXT NOT NULL REFERENCES accounts(id),
  date              TEXT NOT NULL,
  reference         TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL CHECK (status IN ('posted','reversed')),
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  reversed_at       TEXT,
  legacy_id         TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_salary_payments_legacy ON salary_payments(legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS advances (
  id           TEXT PRIMARY KEY,
  number       TEXT NOT NULL UNIQUE,
  employee_id  TEXT NOT NULL REFERENCES employees(id),
  date         TEXT NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL CHECK (status IN ('open','settled','reversed')),
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  legacy_id    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_advances_legacy ON advances(legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS advance_repayments (
  id          TEXT PRIMARY KEY,
  number      TEXT NOT NULL UNIQUE,
  advance_id  TEXT NOT NULL REFERENCES advances(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  date        TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  notes       TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  legacy_id   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_advance_repayments_legacy ON advance_repayments(legacy_id) WHERE legacy_id IS NOT NULL;

-- ============================ TAXES =============================

CREATE TABLE IF NOT EXISTS tax_rules (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  rate_percent REAL NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  applies_to   TEXT NOT NULL CHECK (applies_to IN ('sales','purchases','both')),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  effective_from TEXT NOT NULL,
  effective_to   TEXT,
  created_at   TEXT NOT NULL,
  legacy_id    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_rules_legacy ON tax_rules(legacy_id) WHERE legacy_id IS NOT NULL;

-- ========================== AUDIT LOG ===========================

ALTER TABLE audit_log ADD COLUMN entity_id TEXT;
ALTER TABLE audit_log ADD COLUMN legacy_id TEXT;

-- ====================== IMPORT STAGING ==========================

-- Staging tables hold raw legacy rows before validation. They are wiped
-- per import run and never referenced by application queries.
CREATE TABLE IF NOT EXISTS import_runs (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  report_json   TEXT
);

CREATE TABLE IF NOT EXISTS import_staging (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  table_name   TEXT NOT NULL,
  row_index    INTEGER NOT NULL,
  raw_json     TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','imported','rejected')),
  reason       TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_staging_run ON import_staging(run_id, table_name);