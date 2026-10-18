-- Migration 003 — derived stock views and supporting indexes.
-- Stock balances are DERIVED from stock_movements, never stored redundantly.
-- This is the documented reconciliation strategy: the movement ledger is the
-- single source of truth for inventory.

CREATE VIEW IF NOT EXISTS v_warehouse_stock AS
SELECT
  sm.product_id,
  sm.warehouse_id,
  SUM(sm.qty) AS qty
FROM stock_movements sm
GROUP BY sm.product_id, sm.warehouse_id;

CREATE VIEW IF NOT EXISTS v_product_stock AS
SELECT
  sm.product_id,
  SUM(sm.qty) AS qty
FROM stock_movements sm
GROUP BY sm.product_id;

CREATE VIEW IF NOT EXISTS v_account_balance AS
SELECT
  a.id AS account_id,
  a.opening_balance + COALESCE(SUM(cm.amount), 0) AS balance
FROM accounts a
LEFT JOIN cash_movements cm ON cm.account_id = a.id
GROUP BY a.id;

CREATE VIEW IF NOT EXISTS v_customer_balance AS
SELECT
  c.id AS customer_id,
  c.opening_balance
    + COALESCE((SELECT SUM(total - paid) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'finalized'), 0)
    - COALESCE((SELECT SUM(total) FROM sales_returns r WHERE r.customer_id = c.id), 0)
    - COALESCE((SELECT SUM(amount) FROM vouchers v WHERE v.party_id = c.id AND v.kind = 'receipt' AND v.subtype = 'customer-payment' AND v.status = 'posted'), 0)
    + COALESCE((SELECT SUM(amount) FROM vouchers v WHERE v.party_id = c.id AND v.kind = 'payment' AND v.subtype = 'customer-refund' AND v.status = 'posted'), 0)
    AS balance
FROM customers c;

CREATE VIEW IF NOT EXISTS v_supplier_balance AS
SELECT
  s.id AS supplier_id,
  s.opening_balance
    + COALESCE((SELECT SUM(total - paid) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'finalized'), 0)
    - COALESCE((SELECT SUM(total) FROM purchase_returns r WHERE r.supplier_id = s.id), 0)
    - COALESCE((SELECT SUM(amount) FROM vouchers v WHERE v.party_id = s.id AND v.kind = 'payment' AND v.subtype = 'supplier-payment' AND v.status = 'posted'), 0)
    + COALESCE((SELECT SUM(amount) FROM vouchers v WHERE v.party_id = s.id AND v.kind = 'receipt' AND v.subtype = 'supplier-refund' AND v.status = 'posted'), 0)
    AS balance
FROM suppliers s;

-- Supporting indexes for common report filters.
CREATE INDEX IF NOT EXISTS idx_invoices_status_date ON invoices(status, date);
CREATE INDEX IF NOT EXISTS idx_purchases_status_date ON purchases(status, date);
CREATE INDEX IF NOT EXISTS idx_cash_type_date ON cash_movements(type, date);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);