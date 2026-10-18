import type { StockMovement } from "@/lib/types";

/**
 * Phase 3 → Phase 4 compatibility shim.
 *
 * Phase 3's `productMovements(productId)` returned a lightweight shape:
 *   { id, date, type: string, qty: number, ref: string }
 *
 * Phase 4's `productMovements(productId)` returns full `StockMovement[]`:
 *   { id, date, productId, productName, warehouseId, warehouseName,
 *     qty, type, reference, reason, user, balanceAfter }
 *
 * Any older consumer that read `.ref` (instead of `.reference`) or expected
 * a human-readable `type` label will break. This adapter maps the new shape
 * back to the old field names so both consumers keep working.
 */

export interface LegacyMovement {
  id: string;
  date: string;
  type: string;
  qty: number;
  ref: string;
}

const TYPE_LABELS: Record<string, string> = {
  purchase: "شراء",
  sale: "بيع",
  "sales-return": "مرتجع بيع",
  "purchase-return": "مرتجع شراء",
  "transfer-out": "تحويل صادر",
  "transfer-in": "تحويل وارد",
  "adjustment-in": "تسوية زيادة",
  "adjustment-out": "تسوية نقص",
  opening: "رصيد افتتاحي",
};

export function toLegacyMovement(m: StockMovement): LegacyMovement {
  return {
    id: m.id,
    date: m.date,
    type: TYPE_LABELS[m.type] ?? m.type,
    qty: m.qty,
    ref: m.reference,
  };
}

export function toLegacyMovements(list: StockMovement[]): LegacyMovement[] {
  return list.map(toLegacyMovement);
}