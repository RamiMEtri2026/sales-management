-- Sanitized development fixtures.
-- These are FAKE records for local development only.
-- They contain no real customer, supplier, employee, or financial data.
-- Loaded by `npm run seed:dev` against the DEVELOPMENT database only.
-- Production startup never runs this file.

-- Guard: refuse to run against a database that already has real invoices.
-- (The seed script checks this before executing.)

INSERT OR IGNORE INTO categories (id, code, name, active, created_at, updated_at)
VALUES
  ('cat-dev-1', 'DEV-CAT-1', 'مواد غذائية (تجريبي)', 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('cat-dev-2', 'DEV-CAT-2', 'منظفات (تجريبي)',      1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO units (id, code, name, active, created_at, updated_at)
VALUES
  ('unit-dev-1', 'DEV-U-1', 'قطعة (تجريبي)', 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('unit-dev-2', 'DEV-U-2', 'كرتونة (تجريبي)', 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO products (id, sku, barcode, name, category_id, unit_id, cost_price, sale_price, reorder_level, active, created_at, updated_at)
VALUES
  ('prod-dev-1', 'DEV-P-001', '2000000000015', 'منتج تجريبي أ', 'cat-dev-1', 'unit-dev-1', 1500, 2500, 10, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('prod-dev-2', 'DEV-P-002', '2000000000022', 'منتج تجريبي ب', 'cat-dev-2', 'unit-dev-2', 3000, 4500, 5,  1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO customers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at)
VALUES
  ('cust-dev-1', 'DEV-C-001', 'عميل تجريبي', '01000000000', 'القاهرة (تجريبي)', 0, 0, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO suppliers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at)
VALUES
  ('sup-dev-1', 'DEV-S-001', 'مورد تجريبي', '01100000000', 'الجيزة (تجريبي)', 0, 0, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO accounts (id, code, name, type, opening_balance, active, created_at, updated_at)
VALUES
  ('acc-dev-1', 'DEV-A-001', 'خزنة تجريبية', 'cash', 0, 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');