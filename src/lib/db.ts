import type {
  AppData,
  AuditEntry,
  CashMovement,
  Category,
  Customer,
  ExpenseCategory,
  InvoiceLine,
  LineTotals,
  MovementType,
  Permission,
  Product,
  Role,
  Settings,
  StockMovement,
  Supplier,
  TaxRule,
  Unit,
  User,
  Warehouse,
} from "@/lib/types";
import { addMoney, percentOf, round2, subMoney, sumMoney } from "@/lib/money";

export const STORAGE_KEY = "sms.data.v5";

/* ----------------------------- errors ----------------------------- */

export class ValidationError extends Error {}
export class PermissionError extends Error {}

/* --------------------------- permissions -------------------------- */

const MATRIX: Record<Role, Permission[]> = {
  admin: ["view", "create", "edit", "delete", "approve", "print", "export"],
  manager: ["view", "create", "edit", "approve", "print", "export"],
  cashier: ["view", "create", "print"],
  viewer: ["view", "print"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function requirePermission(actor: User, permission: Permission): void {
  if (!can(actor.role, permission)) {
    throw new PermissionError(`لا تملك صلاحية «${permission}» لتنفيذ هذه العملية.`);
  }
}

/* ------------------------------ ids ------------------------------- */

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nextNumber(data: AppData, key: string, prefix: string): string {
  const n = (data.counters[key] ?? 0) + 1;
  data.counters[key] = n;
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

/* --------------------------- seed data ---------------------------- */

export function seed(): AppData {
  const now = new Date().toISOString();
  const admin: User = { id: "u_admin", name: "مدير النظام", username: "admin", role: "admin", active: true };
  const manager: User = { id: "u_manager", name: "أحمد المدير", username: "manager", role: "manager", active: true };
  const cashier: User = { id: "u_cashier", name: "سارة الكاشير", username: "cashier", role: "cashier", active: true };

  const cat1: Category = { id: "cat_1", code: "CAT-001", name: "مواد غذائية", active: true };
  const cat2: Category = { id: "cat_2", code: "CAT-002", name: "مشروبات", active: true };
  const cat3: Category = { id: "cat_3", code: "CAT-003", name: "منظفات", active: true };

  const un1: Unit = { id: "un_1", code: "PCS", name: "قطعة", active: true };
  const un2: Unit = { id: "un_2", code: "KG", name: "كيلو", active: true };
  const un3: Unit = { id: "un_3", code: "BOX", name: "كرتونة", active: true };

  const warehouses: Warehouse[] = [
    { id: "wh_1", code: "WH-001", name: "المخزن الرئيسي", location: "القاهرة", description: "المخزن الرئيسي للشركة", active: true },
    { id: "wh_2", code: "WH-002", name: "مخزن الفرع", location: "الجيزة", description: "مخزن فرع الجيزة", active: true },
  ];

  const products: Product[] = [
    { id: "p_1", sku: "SKU-1001", barcode: "6221031001", name: "أرز مصري فاخر", description: "أرز أبيض درجة أولى", categoryId: cat1.id, unitId: un2.id, costPrice: 28, salePrice: 35, stock: 120, reorderLevel: 20, active: true },
    { id: "p_2", sku: "SKU-1002", barcode: "6221031002", name: "زيت عافية 1 لتر", description: "زيت طهي", categoryId: cat1.id, unitId: un1.id, costPrice: 52, salePrice: 65, stock: 80, reorderLevel: 15, active: true },
    { id: "p_3", sku: "SKU-1003", barcode: "6221031003", name: "سكر ناعم 1 كجم", description: "سكر أبيض", categoryId: cat1.id, unitId: un2.id, costPrice: 22, salePrice: 28, stock: 200, reorderLevel: 30, active: true },
    { id: "p_4", sku: "SKU-2001", barcode: "6221032001", name: "بيبسي 1.5 لتر", description: "مشروب غازي", categoryId: cat2.id, unitId: un1.id, costPrice: 14, salePrice: 20, stock: 150, reorderLevel: 24, active: true },
    { id: "p_5", sku: "SKU-2002", barcode: "6221032002", name: "عصير جوافة", description: "عصير طبيعي", categoryId: cat2.id, unitId: un1.id, costPrice: 9, salePrice: 14, stock: 60, reorderLevel: 12, active: true },
    { id: "p_6", sku: "SKU-3001", barcode: "6221033001", name: "صابون غسيل 5 كجم", description: "منظف غسيل", categoryId: cat3.id, unitId: un3.id, costPrice: 95, salePrice: 120, stock: 40, reorderLevel: 8, active: true },
  ];

  const customers: Customer[] = [
    { id: "c_1", code: "CUS-0001", name: "سوبر ماركت النور", phone: "01001234567", email: "noor@example.com", address: "المعادي، القاهرة", notes: "عميل جملة", openingBalance: 0, balance: 0, active: true },
    { id: "c_2", code: "CUS-0002", name: "بقالة الأمانة", phone: "01112345678", email: "", address: "فيصل، الجيزة", notes: "", openingBalance: 0, balance: 0, active: true },
    { id: "c_3", code: "CUS-0003", name: "كافيه السلام", phone: "01223456789", email: "salam@example.com", address: "مدينة نصر", notes: "دفع شهري", openingBalance: 0, balance: 0, active: true },
  ];

  const suppliers: Supplier[] = [
    { id: "s_1", code: "SUP-0001", name: "شركة الدلتا للتوريدات", phone: "01555667788", email: "delta@example.com", address: "العاشر من رمضان", notes: "مورد رئيسي", openingBalance: 0, balance: 0, active: true },
    { id: "s_2", code: "SUP-0002", name: "مؤسسة الوفاء التجارية", phone: "01666778899", email: "", address: "6 أكتوبر", notes: "", openingBalance: 0, balance: 0, active: true },
  ];

  const accounts = [
    { id: "acc_1", code: "CSH-001", name: "الخزينة الرئيسية", kind: "cashbox" as const, openingBalance: 5000, active: true },
    { id: "acc_2", code: "BNK-001", name: "بنك مصر - جاري", kind: "bank" as const, openingBalance: 25000, active: true },
    { id: "acc_3", code: "CSH-002", name: "خزينة الفرع", kind: "cashbox" as const, openingBalance: 2000, active: true },
  ];

  const expenseCategories: ExpenseCategory[] = [
    { id: "ec_1", code: "EXP-001", name: "إيجار", active: true },
    { id: "ec_2", code: "EXP-002", name: "كهرباء ومياه", active: true },
    { id: "ec_3", code: "EXP-003", name: "رواتب وأجور", active: true },
    { id: "ec_4", code: "EXP-004", name: "صيانة", active: true },
    { id: "ec_5", code: "EXP-005", name: "مصاريف نقل", active: true },
    { id: "ec_6", code: "EXP-006", name: "مصاريف إدارية", active: true },
  ];

  const taxes: TaxRule[] = [
    { id: "tax_1", name: "ضريبة القيمة المضافة", percent: 14, appliesTo: "both", active: true },
  ];

  const settings: Settings = {
    companyName: "شركة النخبة للتجارة",
    currency: "EGP",
    taxPercent: 14,
    stockControl: true,
    allowNegativeStock: false,
  };

  const audit: AuditEntry[] = [
    { id: uid("a"), date: now, user: admin.name, action: "تهيئة النظام", detail: "تم إنشاء البيانات الأولية" },
  ];

  const stockMovements: StockMovement[] = products.map((p) => ({
    id: uid("sm"),
    date: now,
    productId: p.id,
    productName: p.name,
    warehouseId: warehouses[0].id,
    warehouseName: warehouses[0].name,
    qty: p.stock,
    type: "opening",
    reference: "OPENING",
    reason: "رصيد افتتاحي",
    user: admin.name,
    balanceAfter: p.stock,
  }));

  return {
    users: [admin, manager, cashier],
    categories: [cat1, cat2, cat3],
    units: [un1, un2, un3],
    products,
    customers,
    suppliers,
    warehouses,
    accounts,
    invoices: [],
    purchases: [],
    salesReturns: [],
    purchaseReturns: [],
    cash: [],
    vouchers: [],
    accountTransfers: [],
    expenseCategories,
    expenses: [],
    incomes: [],
    employees: [
      { id: "e_1", name: "محمد علي", position: "أمين مخزن", phone: "01098765432", salary: 6000, active: true },
      { id: "e_2", name: "هدى سامي", position: "محاسب", phone: "01187654321", salary: 8500, active: true },
    ],
    taxes,
    audit,
    stockMovements,
    transfers: [],
    adjustments: [],
    settings,
    counters: {},
  };
}

/* ---------------------------- persistence ------------------------- */

let cache: AppData | null = null;
const listeners = new Set<() => void>();

export function load(): AppData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      cache = migrate(parsed);
      return cache;
    }
  } catch {
    /* fall through to seed */
  }
  cache = seed();
  persist();
  return cache;
}

export function setCache(data: AppData): void {
  cache = data;
}

function migrate(data: AppData): AppData {
  data.warehouses ??= seed().warehouses;
  data.accounts ??= seed().accounts;
  data.salesReturns ??= [];
  data.purchaseReturns ??= [];
  data.counters ??= {};
  data.stockMovements ??= [];
  data.transfers ??= [];
  data.adjustments ??= [];
  data.vouchers ??= [];
  data.accountTransfers ??= [];
  data.expenseCategories ??= seed().expenseCategories;
  data.expenses ??= [];
  data.incomes ??= [];
  for (const a of data.accounts) {
    a.code ??= a.kind === "bank" ? `BNK-${a.id.slice(-3)}` : `CSH-${a.id.slice(-3)}`;
  }
  for (const w of data.warehouses) w.description ??= "";
  for (const inv of data.invoices ?? []) {
    inv.warehouseId ??= data.warehouses[0]?.id ?? "";
    inv.paymentMethod ??= "cash";
    inv.accountId ??= data.accounts[0]?.id ?? "";
    inv.notes ??= "";
    inv.finalizedAt ??= inv.status === "finalized" ? inv.date : null;
    for (const l of inv.lines) {
      l.returnedQty ??= 0;
      l.unitId ??= data.products.find((p) => p.id === l.productId)?.unitId ?? "";
    }
  }
  for (const pur of data.purchases ?? []) {
    pur.warehouseId ??= data.warehouses[0]?.id ?? "";
    pur.supplierRef ??= "";
    pur.paymentMethod ??= "cash";
    pur.accountId ??= data.accounts[0]?.id ?? "";
    pur.notes ??= "";
    pur.finalizedAt ??= pur.status === "finalized" ? pur.date : null;
    for (const l of pur.lines) {
      l.returnedQty ??= 0;
      l.unitId ??= data.products.find((p) => p.id === l.productId)?.unitId ?? "";
    }
  }
  for (const e of data.expenses as unknown as Array<Record<string, unknown>>) {
    if (!("categoryId" in e)) {
      const legacy = e as { id: string; date: string; category: string; amount: number; note: string; createdBy: string };
      const cat = data.expenseCategories.find((c) => c.name === legacy.category) ?? data.expenseCategories[0];
      Object.assign(e, {
        number: `EXP-${legacy.id.slice(-5)}`,
        categoryId: cat?.id ?? "",
        categoryName: cat?.name ?? legacy.category,
        accountId: data.accounts[0]?.id ?? "",
        description: legacy.note ?? "",
        reference: "",
        status: "posted",
        reversedAt: null,
      });
      delete (e as Record<string, unknown>).category;
      delete (e as Record<string, unknown>).note;
    }
  }
  return data;
}

export function persist(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full / unavailable — in-memory state still works for the session */
  }
}

export function emit(): void {
  persist();
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): AppData {
  return load();
}

/* ----------------------------- helpers ---------------------------- */

export function audit(data: AppData, actor: User, action: string, detail: string): void {
  data.audit.unshift({ id: uid("a"), date: new Date().toISOString(), user: actor.name, action, detail });
  if (data.audit.length > 500) data.audit.length = 500;
}

export function findProduct(data: AppData, id: string): Product {
  const p = data.products.find((x) => x.id === id);
  if (!p) throw new ValidationError("المنتج غير موجود.");
  return p;
}

export function findWarehouse(data: AppData, id: string): Warehouse {
  const w = data.warehouses.find((x) => x.id === id);
  if (!w) throw new ValidationError("المخزن غير موجود.");
  return w;
}

export function findAccount(data: AppData, id: string) {
  const a = data.accounts.find((x) => x.id === id);
  if (!a) throw new ValidationError("الحساب غير موجود.");
  return a;
}

/* ------------------------ inventory ledger ------------------------ */

export function warehouseQty(data: AppData, productId: string, warehouseId: string): number {
  let q = 0;
  for (const m of data.stockMovements) {
    if (m.productId === productId && m.warehouseId === warehouseId) q = addMoney(q, m.qty);
  }
  return round2(q);
}

export function productTotalQty(data: AppData, productId: string): number {
  let q = 0;
  for (const m of data.stockMovements) {
    if (m.productId === productId) q = addMoney(q, m.qty);
  }
  return round2(q);
}

export function recordMovement(
  data: AppData,
  actor: User,
  input: {
    date: string;
    productId: string;
    warehouseId: string;
    qty: number;
    type: MovementType;
    reference: string;
    reason: string;
  },
): StockMovement {
  const product = findProduct(data, input.productId);
  const warehouse = findWarehouse(data, input.warehouseId);
  const before = warehouseQty(data, input.productId, input.warehouseId);
  const after = round2(before + input.qty);
  if (data.settings.stockControl && !data.settings.allowNegativeStock && after < 0) {
    throw new ValidationError(
      `الكمية المتاحة من «${product.name}» في «${warehouse.name}» (${before}) لا تكفي لهذه الحركة (${input.qty}).`,
    );
  }
  const movement: StockMovement = {
    id: uid("sm"),
    date: input.date,
    productId: input.productId,
    productName: product.name,
    warehouseId: input.warehouseId,
    warehouseName: warehouse.name,
    qty: round2(input.qty),
    type: input.type,
    reference: input.reference,
    reason: input.reason,
    user: actor.name,
    balanceAfter: after,
  };
  data.stockMovements.unshift(movement);
  product.stock = productTotalQty(data, input.productId);
  return movement;
}

export function reconcileStock(): void {
  const data = load();
  for (const p of data.products) p.stock = productTotalQty(data, p.id);
  emit();
}

/* --------------------------- calculations ------------------------- */

export function computeLineTotal(line: InvoiceLine): number {
  const gross = round2(line.unitPrice * line.quantity);
  const afterDiscount = subMoney(gross, percentOf(gross, line.discountPercent));
  return addMoney(afterDiscount, percentOf(afterDiscount, line.taxPercent));
}

export function computeTotals(lines: InvoiceLine[]): LineTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let total = 0;
  for (const line of lines) {
    const gross = round2(line.unitPrice * line.quantity);
    const discount = percentOf(gross, line.discountPercent);
    const afterDiscount = subMoney(gross, discount);
    const tax = percentOf(afterDiscount, line.taxPercent);
    subtotal = addMoney(subtotal, gross);
    discountTotal = addMoney(discountTotal, discount);
    taxTotal = addMoney(taxTotal, tax);
    total = addMoney(total, afterDiscount, tax);
  }
  return { subtotal, discountTotal, taxTotal, total };
}

/* --------------------------- validation --------------------------- */

export function validateLines(data: AppData, lines: InvoiceLine[], isSale: boolean, warehouseId: string): void {
  if (lines.length === 0) throw new ValidationError("يجب إضافة بند واحد على الأقل.");
  for (const line of lines) {
    const product = findProduct(data, line.productId);
    if (!product.active) throw new ValidationError(`المنتج «${product.name}» غير نشط.`);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new ValidationError(`الكمية في بند «${product.name}» يجب أن تكون أكبر من صفر.`);
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new ValidationError(`السعر في بند «${product.name}» غير صالح.`);
    }
    if (line.discountPercent < 0 || line.discountPercent > 100) {
      throw new ValidationError(`نسبة الخصم في بند «${product.name}» يجب أن تكون بين 0 و 100.`);
    }
    if (line.taxPercent < 0 || line.taxPercent > 100) {
      throw new ValidationError(`نسبة الضريبة في بند «${product.name}» يجب أن تكون بين 0 و 100.`);
    }
    if (isSale && data.settings.stockControl && !data.settings.allowNegativeStock) {
      const available = warehouseQty(data, line.productId, warehouseId);
      if (line.quantity > available) {
        throw new ValidationError(`الكمية المطلوبة من «${product.name}» (${line.quantity}) أكبر من المتاح في المخزن (${available}).`);
      }
    }
  }
}

/* --------------------------- cash ledger -------------------------- */

export function postCash(
  data: AppData,
  actor: User,
  input: { date: string; type: CashMovement["type"]; amount: number; reference: string; note: string; accountId: string; sourceId?: string },
): CashMovement {
  const account = findAccount(data, input.accountId);
  if (!account.active) throw new ValidationError(`الحساب «${account.name}» معطّل.`);
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new ValidationError("قيمة الحركة المالية غير صالحة.");
  const movement: CashMovement = {
    id: uid("cm"),
    date: input.date,
    type: input.type,
    amount: round2(input.amount),
    reference: input.reference,
    note: input.note,
    accountId: input.accountId,
    sourceId: input.sourceId,
    user: actor.name,
  };
  data.cash.unshift(movement);
  return movement;
}

export function accountBalanceFrom(data: AppData, accountId: string): number {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  const movements = data.cash.filter((c) => c.accountId === accountId);
  return addMoney(account.openingBalance, sumMoney(movements.map((c) => c.amount)));
}