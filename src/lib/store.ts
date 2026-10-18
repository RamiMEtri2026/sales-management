import type {
  Account,
  AccountTransfer,
  Adjustment,
  AppData,
  CashMovement,
  Category,
  Customer,
  Employee,
  Expense,
  ExpenseCategory,
  Income,
  Invoice,
  InvoiceLine,
  PaymentMethod,
  Product,
  Purchase,
  PurchaseReturn,
  SalesReturn,
  Settings,
  StockMovement,
  Supplier,
  TaxRule,
  Transfer,
  TransferLine,
  Unit,
  User,
  Voucher,
  VoucherKind,
  Warehouse,
} from "@/lib/types";
import { addMoney, round2, subMoney, sumMoney } from "@/lib/money";
import {
  ValidationError,
  PermissionError,
  can,
  requirePermission,
  uid,
  nextNumber,
  load,
  setCache,
  persist,
  emit,
  subscribe,
  getSnapshot,
  audit,
  findProduct,
  findWarehouse,
  findAccount,
  warehouseQty,
  productTotalQty,
  recordMovement,
  reconcileStock,
  computeLineTotal,
  computeTotals,
  validateLines,
  postCash,
  accountBalanceFrom,
  seed,
} from "@/lib/db";

export {
  ValidationError,
  PermissionError,
  can,
  requirePermission,
  load,
  persist,
  emit,
  subscribe,
  getSnapshot,
  audit,
  warehouseQty,
  productTotalQty,
  reconcileStock,
  computeLineTotal,
  computeTotals,
  seed,
};

/* ============================ PRODUCTS ============================ */

export function saveProduct(actor: User, input: Omit<Product, "id"> & { id?: string }): Product {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم المنتج مطلوب.");
  if (!input.sku.trim()) throw new ValidationError("كود المنتج (SKU) مطلوب.");
  if (!input.categoryId) throw new ValidationError("يجب اختيار التصنيف.");
  if (!input.unitId) throw new ValidationError("يجب اختيار الوحدة.");
  if (input.salePrice <= 0) throw new ValidationError("سعر البيع يجب أن يكون أكبر من صفر.");
  if (input.costPrice < 0 || input.stock < 0 || input.reorderLevel < 0) {
    throw new ValidationError("الأسعار والكميات لا يمكن أن تكون سالبة.");
  }
  const dupSku = data.products.find((p) => p.sku.toLowerCase() === input.sku.trim().toLowerCase() && p.id !== input.id);
  if (dupSku) throw new ValidationError("كود المنتج مستخدم بالفعل.");
  if (input.barcode.trim()) {
    const dupBar = data.products.find((p) => p.barcode === input.barcode.trim() && p.id !== input.id);
    if (dupBar) throw new ValidationError("الباركود مستخدم بالفعل.");
  }
  if (input.id) {
    const existing = data.products.find((p) => p.id === input.id);
    if (!existing) throw new ValidationError("المنتج غير موجود.");
    const { stock: _ignored, ...rest } = input;
    Object.assign(existing, rest, { sku: input.sku.trim(), barcode: input.barcode.trim() });
    audit(data, actor, "تعديل منتج", existing.name);
    emit();
    return existing;
  }
  const product: Product = { ...input, id: uid("p"), sku: input.sku.trim(), barcode: input.barcode.trim(), stock: 0 };
  data.products.unshift(product);
  if (input.stock > 0) {
    const wh = data.warehouses.find((w) => w.active) ?? data.warehouses[0];
    if (wh) {
      recordMovement(data, actor, {
        date: new Date().toISOString(),
        productId: product.id,
        warehouseId: wh.id,
        qty: input.stock,
        type: "opening",
        reference: "OPENING",
        reason: "رصيد افتتاحي عند إنشاء المنتج",
      });
    }
  }
  audit(data, actor, "إضافة منتج", product.name);
  emit();
  return product;
}

export function deleteProduct(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const product = data.products.find((p) => p.id === id);
  if (!product) throw new ValidationError("المنتج غير موجود.");
  const used =
    data.invoices.some((i) => i.lines.some((l) => l.productId === id)) ||
    data.purchases.some((p) => p.lines.some((l) => l.productId === id)) ||
    data.stockMovements.some((m) => m.productId === id && m.type !== "opening");
  if (used) {
    product.active = false;
    audit(data, actor, "تعطيل منتج", `${product.name} (له حركات سابقة)`);
    emit();
    return;
  }
  data.products = data.products.filter((p) => p.id !== id);
  data.stockMovements = data.stockMovements.filter((m) => m.productId !== id);
  audit(data, actor, "حذف منتج", product.name);
  emit();
}

export function productMovements(productId: string): StockMovement[] {
  return load()
    .stockMovements.filter((m) => m.productId === productId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* =========================== CATEGORIES =========================== */

export function saveCategory(actor: User, input: Omit<Category, "id"> & { id?: string }): Category {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم التصنيف مطلوب.");
  if (!input.code.trim()) throw new ValidationError("كود التصنيف مطلوب.");
  const dup = data.categories.find((c) => (c.code.toLowerCase() === input.code.trim().toLowerCase() || c.name === input.name.trim()) && c.id !== input.id);
  if (dup) throw new ValidationError("كود أو اسم التصنيف مستخدم بالفعل.");
  if (input.id) {
    const existing = data.categories.find((c) => c.id === input.id);
    if (!existing) throw new ValidationError("التصنيف غير موجود.");
    Object.assign(existing, input, { code: input.code.trim(), name: input.name.trim() });
    audit(data, actor, "تعديل تصنيف", existing.name);
    emit();
    return existing;
  }
  const cat: Category = { ...input, id: uid("cat"), code: input.code.trim(), name: input.name.trim() };
  data.categories.unshift(cat);
  audit(data, actor, "إضافة تصنيف", cat.name);
  emit();
  return cat;
}

export function deleteCategory(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const cat = data.categories.find((c) => c.id === id);
  if (!cat) throw new ValidationError("التصنيف غير موجود.");
  const used = data.products.some((p) => p.categoryId === id);
  if (used) throw new ValidationError("لا يمكن حذف التصنيف لوجود منتجات مرتبطة به.");
  data.categories = data.categories.filter((c) => c.id !== id);
  audit(data, actor, "حذف تصنيف", cat.name);
  emit();
}

export function categoryName(id: string): string {
  return load().categories.find((c) => c.id === id)?.name ?? "—";
}

/* ============================= UNITS ============================== */

export function saveUnit(actor: User, input: Omit<Unit, "id"> & { id?: string }): Unit {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم الوحدة مطلوب.");
  if (!input.code.trim()) throw new ValidationError("كود الوحدة مطلوب.");
  const dup = data.units.find((u) => (u.code.toLowerCase() === input.code.trim().toLowerCase() || u.name === input.name.trim()) && u.id !== input.id);
  if (dup) throw new ValidationError("كود أو اسم الوحدة مستخدم بالفعل.");
  if (input.id) {
    const existing = data.units.find((u) => u.id === input.id);
    if (!existing) throw new ValidationError("الوحدة غير موجودة.");
    Object.assign(existing, input, { code: input.code.trim(), name: input.name.trim() });
    audit(data, actor, "تعديل وحدة", existing.name);
    emit();
    return existing;
  }
  const unit: Unit = { ...input, id: uid("un"), code: input.code.trim(), name: input.name.trim() };
  data.units.unshift(unit);
  audit(data, actor, "إضافة وحدة", unit.name);
  emit();
  return unit;
}

export function deleteUnit(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const unit = data.units.find((u) => u.id === id);
  if (!unit) throw new ValidationError("الوحدة غير موجودة.");
  const used = data.products.some((p) => p.unitId === id);
  if (used) throw new ValidationError("لا يمكن حذف الوحدة لوجود منتجات مرتبطة بها.");
  data.units = data.units.filter((u) => u.id !== id);
  audit(data, actor, "حذف وحدة", unit.name);
  emit();
}

export function unitName(id: string): string {
  return load().units.find((u) => u.id === id)?.name ?? "—";
}

/* =========================== CUSTOMERS ============================ */

export function saveCustomer(actor: User, input: Omit<Customer, "id" | "code"> & { id?: string }): Customer {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم العميل مطلوب.");
  if (!input.phone.trim()) throw new ValidationError("رقم الهاتف مطلوب.");
  if (input.openingBalance < 0) throw new ValidationError("الرصيد الافتتاحي لا يمكن أن يكون سالبًا.");
  if (input.id) {
    const existing = data.customers.find((c) => c.id === input.id);
    if (!existing) throw new ValidationError("العميل غير موجود.");
    Object.assign(existing, input, { name: input.name.trim(), phone: input.phone.trim() });
    audit(data, actor, "تعديل عميل", existing.name);
    emit();
    return existing;
  }
  const code = nextNumber(data, "customer", "CUS");
  const customer: Customer = { ...input, id: uid("c"), code, name: input.name.trim(), phone: input.phone.trim(), balance: input.openingBalance };
  data.customers.unshift(customer);
  audit(data, actor, "إضافة عميل", customer.name);
  emit();
  return customer;
}

export function toggleCustomerActive(actor: User, id: string): void {
  requirePermission(actor, "edit");
  const data = load();
  const c = data.customers.find((x) => x.id === id);
  if (!c) throw new ValidationError("العميل غير موجود.");
  c.active = !c.active;
  audit(data, actor, c.active ? "تنشيط عميل" : "تعطيل عميل", c.name);
  emit();
}

export function deleteCustomer(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const c = data.customers.find((x) => x.id === id);
  if (!c) throw new ValidationError("العميل غير موجود.");
  const hasHistory = data.invoices.some((i) => i.customerId === id) || data.salesReturns.some((r) => r.customerId === id) || data.vouchers.some((v) => v.partyId === id);
  if (hasHistory) throw new ValidationError("لا يمكن حذف العميل لوجود فواتير أو مرتجعات أو سندات مرتبطة به. يمكنك تعطيله بدلًا من ذلك.");
  if (Math.abs(c.balance) > 0.001) throw new ValidationError("لا يمكن حذف العميل لوجود رصيد مالي مستحق. سوِّ الرصيد أولًا.");
  data.customers = data.customers.filter((x) => x.id !== id);
  audit(data, actor, "حذف عميل", c.name);
  emit();
}

export function customerInvoices(customerId: string): Invoice[] {
  return load().invoices.filter((i) => i.customerId === customerId).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* =========================== SUPPLIERS ============================ */

export function saveSupplier(actor: User, input: Omit<Supplier, "id" | "code"> & { id?: string }): Supplier {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم المورد مطلوب.");
  if (!input.phone.trim()) throw new ValidationError("رقم الهاتف مطلوب.");
  if (input.openingBalance < 0) throw new ValidationError("الرصيد الافتتاحي لا يمكن أن يكون سالبًا.");
  if (input.id) {
    const existing = data.suppliers.find((s) => s.id === input.id);
    if (!existing) throw new ValidationError("المورد غير موجود.");
    Object.assign(existing, input, { name: input.name.trim(), phone: input.phone.trim() });
    audit(data, actor, "تعديل مورد", existing.name);
    emit();
    return existing;
  }
  const code = nextNumber(data, "supplier", "SUP");
  const supplier: Supplier = { ...input, id: uid("s"), code, name: input.name.trim(), phone: input.phone.trim(), balance: input.openingBalance };
  data.suppliers.unshift(supplier);
  audit(data, actor, "إضافة مورد", supplier.name);
  emit();
  return supplier;
}

export function toggleSupplierActive(actor: User, id: string): void {
  requirePermission(actor, "edit");
  const data = load();
  const s = data.suppliers.find((x) => x.id === id);
  if (!s) throw new ValidationError("المورد غير موجود.");
  s.active = !s.active;
  audit(data, actor, s.active ? "تنشيط مورد" : "تعطيل مورد", s.name);
  emit();
}

export function deleteSupplier(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const s = data.suppliers.find((x) => x.id === id);
  if (!s) throw new ValidationError("المورد غير موجود.");
  const hasHistory = data.purchases.some((p) => p.supplierId === id) || data.purchaseReturns.some((r) => r.supplierId === id) || data.vouchers.some((v) => v.partyId === id);
  if (hasHistory) throw new ValidationError("لا يمكن حذف المورد لوجود فواتير شراء أو مرتجعات أو سندات مرتبطة به. يمكنك تعطيله بدلًا من ذلك.");
  if (Math.abs(s.balance) > 0.001) throw new ValidationError("لا يمكن حذف المورد لوجود رصيد مالي مستحق. سوِّ الرصيد أولًا.");
  data.suppliers = data.suppliers.filter((x) => x.id !== id);
  audit(data, actor, "حذف مورد", s.name);
  emit();
}

export function supplierPurchases(supplierId: string): Purchase[] {
  return load().purchases.filter((p) => p.supplierId === supplierId).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* =========================== WAREHOUSES =========================== */

export function saveWarehouse(actor: User, input: Omit<Warehouse, "id"> & { id?: string }): Warehouse {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم المخزن مطلوب.");
  if (!input.code.trim()) throw new ValidationError("كود المخزن مطلوب.");
  const dup = data.warehouses.find((w) => w.code.toLowerCase() === input.code.trim().toLowerCase() && w.id !== input.id);
  if (dup) throw new ValidationError("كود المخزن مستخدم بالفعل.");
  if (input.id) {
    const existing = data.warehouses.find((w) => w.id === input.id);
    if (!existing) throw new ValidationError("المخزن غير موجود.");
    Object.assign(existing, input, { code: input.code.trim(), name: input.name.trim() });
    audit(data, actor, "تعديل مخزن", existing.name);
    emit();
    return existing;
  }
  const wh: Warehouse = { ...input, id: uid("wh"), code: input.code.trim(), name: input.name.trim() };
  data.warehouses.unshift(wh);
  audit(data, actor, "إضافة مخزن", wh.name);
  emit();
  return wh;
}

export function toggleWarehouseActive(actor: User, id: string): void {
  requirePermission(actor, "edit");
  const data = load();
  const w = data.warehouses.find((x) => x.id === id);
  if (!w) throw new ValidationError("المخزن غير موجود.");
  w.active = !w.active;
  audit(data, actor, w.active ? "تنشيط مخزن" : "تعطيل مخزن", w.name);
  emit();
}

export function deleteWarehouse(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const w = data.warehouses.find((x) => x.id === id);
  if (!w) throw new ValidationError("المخزن غير موجود.");
  const hasMovements = data.stockMovements.some((m) => m.warehouseId === id);
  const hasDocs =
    data.invoices.some((i) => i.warehouseId === id) ||
    data.purchases.some((p) => p.warehouseId === id) ||
    data.transfers.some((t) => t.fromWarehouseId === id || t.toWarehouseId === id);
  if (hasMovements || hasDocs) {
    throw new ValidationError("لا يمكن حذف المخزن لوجود حركات أو مستندات مرتبطة به. يمكنك تعطيله بدلًا من ذلك.");
  }
  data.warehouses = data.warehouses.filter((x) => x.id !== id);
  audit(data, actor, "حذف مخزن", w.name);
  emit();
}

export function warehouseStock(warehouseId: string): { product: Product; qty: number }[] {
  const data = load();
  return data.products
    .map((product) => ({ product, qty: warehouseQty(data, product.id, warehouseId) }))
    .filter((r) => r.qty !== 0)
    .sort((a, b) => b.qty - a.qty);
}

/* ============================ ACCOUNTS ============================ */

export function saveAccount(actor: User, input: Omit<Account, "id"> & { id?: string }): Account {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم الحساب مطلوب.");
  if (!input.code.trim()) throw new ValidationError("كود الحساب مطلوب.");
  if (input.openingBalance < 0) throw new ValidationError("الرصيد الافتتاحي لا يمكن أن يكون سالبًا.");
  const dup = data.accounts.find((a) => a.code.toLowerCase() === input.code.trim().toLowerCase() && a.id !== input.id);
  if (dup) throw new ValidationError("كود الحساب مستخدم بالفعل.");
  if (input.id) {
    const existing = data.accounts.find((a) => a.id === input.id);
    if (!existing) throw new ValidationError("الحساب غير موجود.");
    Object.assign(existing, input, { name: input.name.trim(), code: input.code.trim() });
    audit(data, actor, "تعديل حساب", existing.name);
    emit();
    return existing;
  }
  const acc: Account = { ...input, id: uid("acc"), name: input.name.trim(), code: input.code.trim() };
  data.accounts.unshift(acc);
  audit(data, actor, "إضافة حساب", acc.name);
  emit();
  return acc;
}

export function toggleAccountActive(actor: User, id: string): void {
  requirePermission(actor, "edit");
  const data = load();
  const a = data.accounts.find((x) => x.id === id);
  if (!a) throw new ValidationError("الحساب غير موجود.");
  a.active = !a.active;
  audit(data, actor, a.active ? "تنشيط حساب" : "تعطيل حساب", a.name);
  emit();
}

export function deleteAccount(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const a = data.accounts.find((x) => x.id === id);
  if (!a) throw new ValidationError("الحساب غير موجود.");
  const hasMovements =
    data.cash.some((c) => c.accountId === id) ||
    data.vouchers.some((v) => v.accountId === id) ||
    data.accountTransfers.some((t) => t.fromAccountId === id || t.toAccountId === id) ||
    data.expenses.some((e) => e.accountId === id) ||
    data.incomes.some((i) => i.accountId === id);
  if (hasMovements) throw new ValidationError("لا يمكن حذف الحساب لوجود حركات مالية مرتبطة به. يمكنك تعطيله بدلًا من ذلك.");
  data.accounts = data.accounts.filter((x) => x.id !== id);
  audit(data, actor, "حذف حساب", a.name);
  emit();
}

export function accountBalance(accountId: string): number {
  const data = load();
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  const movements = data.cash.filter((c) => c.accountId === accountId);
  return addMoney(account.openingBalance, sumMoney(movements.map((c) => c.amount)));
}

export function cashBalance(accountId?: string): number {
  const data = load();
  if (accountId) return accountBalance(accountId);
  return sumMoney(data.accounts.map((a) => accountBalance(a.id)));
}

export function accountMovements(accountId: string): CashMovement[] {
  return load()
    .cash.filter((c) => c.accountId === accountId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* =========================== VOUCHERS ============================= */

export interface VoucherInput {
  kind: VoucherKind;
  subtype: string;
  date: string;
  amount: number;
  accountId: string;
  paymentMethod: PaymentMethod;
  partyId: string;
  relatedRef: string;
  description: string;
}

const RECEIPT_SUBTYPES = ["customer-payment", "other-income", "supplier-refund"];
const PAYMENT_SUBTYPES = ["supplier-payment", "customer-refund", "expense", "employee", "other"];

export function createVoucher(actor: User, input: VoucherInput): Voucher {
  requirePermission(actor, "create");
  const data = load();
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ValidationError("المبلغ يجب أن يكون أكبر من صفر.");
  if (!input.accountId) throw new ValidationError("يجب اختيار الحساب.");
  if (!input.description.trim()) throw new ValidationError("البيان مطلوب.");
  const validSubtypes = input.kind === "receipt" ? RECEIPT_SUBTYPES : PAYMENT_SUBTYPES;
  if (!validSubtypes.includes(input.subtype)) throw new ValidationError("نوع السند غير صالح.");

  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const account = findAccount(working, input.accountId);
  let partyName = "—";

  if (input.kind === "receipt") {
    if (input.subtype === "customer-payment") {
      const c = working.customers.find((x) => x.id === input.partyId);
      if (!c) throw new ValidationError("يجب اختيار العميل.");
      if (input.amount > c.balance + 0.001) {
        throw new ValidationError(`المبلغ (${input.amount}) أكبر من رصيد العميل المستحق (${c.balance}).`);
      }
      c.balance = subMoney(c.balance, input.amount);
      partyName = c.name;
    } else if (input.subtype === "supplier-refund") {
      const s = working.suppliers.find((x) => x.id === input.partyId);
      if (!s) throw new ValidationError("يجب اختيار المورد.");
      s.balance = subMoney(s.balance, input.amount);
      partyName = s.name;
    } else {
      partyName = input.partyId || "إيراد آخر";
    }
    postCash(working, actor, {
      date: input.date,
      type: "receipt",
      amount: input.amount,
      reference: "",
      note: input.description.trim(),
      accountId: input.accountId,
    });
  } else {
    if (input.subtype === "supplier-payment") {
      const s = working.suppliers.find((x) => x.id === input.partyId);
      if (!s) throw new ValidationError("يجب اختيار المورد.");
      if (input.amount > s.balance + 0.001) {
        throw new ValidationError(`المبلغ (${input.amount}) أكبر من رصيد المورد المستحق (${s.balance}).`);
      }
      s.balance = subMoney(s.balance, input.amount);
      partyName = s.name;
    } else if (input.subtype === "customer-refund") {
      const c = working.customers.find((x) => x.id === input.partyId);
      if (!c) throw new ValidationError("يجب اختيار العميل.");
      c.balance = addMoney(c.balance, input.amount);
      partyName = c.name;
    } else if (input.subtype === "employee") {
      const e = working.employees.find((x) => x.id === input.partyId);
      if (!e) throw new ValidationError("يجب اختيار الموظف.");
      partyName = e.name;
    } else {
      partyName = input.partyId || "دفعة أخرى";
    }
    if (input.amount > accountBalanceFrom(working, input.accountId) + 0.001) {
      throw new ValidationError(`رصيد الحساب «${account.name}» لا يكفي لهذه الدفعة.`);
    }
    postCash(working, actor, {
      date: input.date,
      type: "payment",
      amount: -input.amount,
      reference: "",
      note: input.description.trim(),
      accountId: input.accountId,
    });
  }

  const number = nextNumber(working, input.kind === "receipt" ? "receipt" : "payment", input.kind === "receipt" ? "RCV" : "PAY");
  const voucher: Voucher = {
    id: uid("v"),
    number,
    kind: input.kind,
    subtype: input.subtype,
    date: input.date,
    amount: input.amount,
    accountId: input.accountId,
    paymentMethod: input.paymentMethod,
    partyId: input.partyId,
    partyName,
    relatedRef: input.relatedRef.trim(),
    description: input.description.trim(),
    status: "posted",
    createdBy: actor.name,
    reversedAt: null,
  };
  working.vouchers.unshift(voucher);
  const cm = working.cash[0];
  if (cm && cm.accountId === input.accountId) cm.reference = number;
  audit(working, actor, input.kind === "receipt" ? "سند قبض" : "سند صرف", `${number} — ${partyName} — ${input.amount}`);
  setCache(working);
  emit();
  return voucher;
}

export function reverseVoucher(actor: User, id: string): Voucher {
  requirePermission(actor, "approve");
  const data = load();
  const v = data.vouchers.find((x) => x.id === id);
  if (!v) throw new ValidationError("السند غير موجود.");
  if (v.status === "reversed") throw new ValidationError("السند معكوس بالفعل.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wV = working.vouchers.find((x) => x.id === id)!;

  postCash(working, actor, {
    date: new Date().toISOString(),
    type: "adjustment",
    amount: wV.kind === "receipt" ? -wV.amount : wV.amount,
    reference: wV.number,
    note: `عكس سند ${wV.number}`,
    accountId: wV.accountId,
    sourceId: wV.id,
  });

  if (wV.subtype === "customer-payment") {
    const c = working.customers.find((x) => x.id === wV.partyId);
    if (c) c.balance = addMoney(c.balance, wV.amount);
  } else if (wV.subtype === "supplier-payment") {
    const s = working.suppliers.find((x) => x.id === wV.partyId);
    if (s) s.balance = addMoney(s.balance, wV.amount);
  } else if (wV.subtype === "customer-refund") {
    const c = working.customers.find((x) => x.id === wV.partyId);
    if (c) c.balance = subMoney(c.balance, wV.amount);
  } else if (wV.subtype === "supplier-refund") {
    const s = working.suppliers.find((x) => x.id === wV.partyId);
    if (s) s.balance = addMoney(s.balance, wV.amount);
  }

  wV.status = "reversed";
  wV.reversedAt = new Date().toISOString();
  audit(working, actor, "عكس سند", wV.number);
  setCache(working);
  emit();
  return wV;
}

/* ====================== ACCOUNT TRANSFERS ========================= */

export interface AccountTransferInput {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: number;
  description: string;
}

export function createAccountTransfer(actor: User, input: AccountTransferInput): AccountTransfer {
  requirePermission(actor, "create");
  const data = load();
  if (!input.fromAccountId || !input.toAccountId) throw new ValidationError("يجب اختيار الحسابين.");
  if (input.fromAccountId === input.toAccountId) throw new ValidationError("لا يمكن التحويل إلى نفس الحساب.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ValidationError("المبلغ يجب أن يكون أكبر من صفر.");
  const from = findAccount(data, input.fromAccountId);
  const to = findAccount(data, input.toAccountId);
  if (!from.active || !to.active) throw new ValidationError("لا يمكن التحويل من أو إلى حساب معطّل.");
  if (input.amount > accountBalanceFrom(data, input.fromAccountId) + 0.001) {
    throw new ValidationError(`رصيد الحساب «${from.name}» لا يكفي للتحويل.`);
  }

  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const number = nextNumber(working, "accountTransfer", "TRF");
  postCash(working, actor, {
    date: input.date,
    type: "transfer-out",
    amount: -input.amount,
    reference: number,
    note: `تحويل إلى ${to.name} — ${input.description.trim()}`,
    accountId: input.fromAccountId,
  });
  postCash(working, actor, {
    date: input.date,
    type: "transfer-in",
    amount: input.amount,
    reference: number,
    note: `تحويل من ${from.name} — ${input.description.trim()}`,
    accountId: input.toAccountId,
  });
  const transfer: AccountTransfer = {
    id: uid("at"),
    number,
    date: input.date,
    fromAccountId: input.fromAccountId,
    fromAccountName: from.name,
    toAccountId: input.toAccountId,
    toAccountName: to.name,
    amount: input.amount,
    description: input.description.trim(),
    createdBy: actor.name,
  };
  working.accountTransfers.unshift(transfer);
  audit(working, actor, "تحويل بين الحسابات", `${number}: ${from.name} ← ${to.name} — ${input.amount}`);
  setCache(working);
  emit();
  return transfer;
}

/* ====================== EXPENSE CATEGORIES ======================== */

export function saveExpenseCategory(actor: User, input: Omit<ExpenseCategory, "id"> & { id?: string }): ExpenseCategory {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم بند المصروف مطلوب.");
  if (!input.code.trim()) throw new ValidationError("كود البند مطلوب.");
  const dup = data.expenseCategories.find((c) => c.code.toLowerCase() === input.code.trim().toLowerCase() && c.id !== input.id);
  if (dup) throw new ValidationError("كود البند مستخدم بالفعل.");
  if (input.id) {
    const existing = data.expenseCategories.find((c) => c.id === input.id);
    if (!existing) throw new ValidationError("البند غير موجود.");
    Object.assign(existing, input, { name: input.name.trim(), code: input.code.trim() });
    audit(data, actor, "تعديل بند مصروف", existing.name);
    emit();
    return existing;
  }
  const cat: ExpenseCategory = { ...input, id: uid("ec"), name: input.name.trim(), code: input.code.trim() };
  data.expenseCategories.unshift(cat);
  audit(data, actor, "إضافة بند مصروف", cat.name);
  emit();
  return cat;
}

export function deleteExpenseCategory(actor: User, id: string): void {
  requirePermission(actor, "delete");
  const data = load();
  const cat = data.expenseCategories.find((c) => c.id === id);
  if (!cat) throw new ValidationError("البند غير موجود.");
  const used = data.expenses.some((e) => e.categoryId === id);
  if (used) throw new ValidationError("لا يمكن حذف البند لوجود مصاريف مرتبطة به.");
  data.expenseCategories = data.expenseCategories.filter((c) => c.id !== id);
  audit(data, actor, "حذف بند مصروف", cat.name);
  emit();
}

/* ============================ EXPENSES ============================ */

export interface ExpenseInput {
  date: string;
  categoryId: string;
  amount: number;
  accountId: string;
  description: string;
  reference: string;
}

export function createExpense(actor: User, input: ExpenseInput): Expense {
  requirePermission(actor, "create");
  const data = load();
  if (!input.categoryId) throw new ValidationError("يجب اختيار بند المصروف.");
  if (!input.accountId) throw new ValidationError("يجب اختيار حساب الدفع.");
  if (!input.description.trim()) throw new ValidationError("وصف المصروف مطلوب.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ValidationError("قيمة المصروف يجب أن تكون أكبر من صفر.");
  const cat = data.expenseCategories.find((c) => c.id === input.categoryId);
  if (!cat) throw new ValidationError("بند المصروف غير موجود.");
  const account = findAccount(data, input.accountId);
  if (input.amount > accountBalanceFrom(data, input.accountId) + 0.001) {
    throw new ValidationError(`رصيد الحساب «${account.name}» لا يكفي لهذا المصروف.`);
  }

  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const number = nextNumber(working, "expense", "EXP");
  postCash(working, actor, {
    date: input.date,
    type: "expense",
    amount: -input.amount,
    reference: number,
    note: `مصروف — ${cat.name}: ${input.description.trim()}`,
    accountId: input.accountId,
  });
  const expense: Expense = {
    id: uid("exp"),
    number,
    date: input.date,
    categoryId: cat.id,
    categoryName: cat.name,
    amount: input.amount,
    accountId: input.accountId,
    description: input.description.trim(),
    reference: input.reference.trim(),
    status: "posted",
    createdBy: actor.name,
    reversedAt: null,
  };
  working.expenses.unshift(expense);
  audit(working, actor, "تسجيل مصروف", `${number} — ${cat.name} — ${input.amount}`);
  setCache(working);
  emit();
  return expense;
}

export function reverseExpense(actor: User, id: string): Expense {
  requirePermission(actor, "approve");
  const data = load();
  const e = data.expenses.find((x) => x.id === id);
  if (!e) throw new ValidationError("المصروف غير موجود.");
  if (e.status === "reversed") throw new ValidationError("المصروف معكوس بالفعل.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wE = working.expenses.find((x) => x.id === id)!;
  postCash(working, actor, {
    date: new Date().toISOString(),
    type: "adjustment",
    amount: wE.amount,
    reference: wE.number,
    note: `عكس مصروف ${wE.number}`,
    accountId: wE.accountId,
    sourceId: wE.id,
  });
  wE.status = "reversed";
  wE.reversedAt = new Date().toISOString();
  audit(working, actor, "عكس مصروف", wE.number);
  setCache(working);
  emit();
  return wE;
}

export function expensesTotal(): number {
  return sumMoney(load().expenses.filter((e) => e.status === "posted").map((e) => e.amount));
}

/* ============================= INCOMES ============================ */

export interface IncomeInput {
  date: string;
  category: string;
  amount: number;
  accountId: string;
  description: string;
  reference: string;
}

export function createIncome(actor: User, input: IncomeInput): Income {
  requirePermission(actor, "create");
  const data = load();
  if (!input.category.trim()) throw new ValidationError("بند الإيراد مطلوب.");
  if (!input.accountId) throw new ValidationError("يجب اختيار الحساب.");
  if (!input.description.trim()) throw new ValidationError("وصف الإيراد مطلوب.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ValidationError("قيمة الإيراد يجب أن تكون أكبر من صفر.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const number = nextNumber(working, "income", "INC");
  postCash(working, actor, {
    date: input.date,
    type: "income",
    amount: input.amount,
    reference: number,
    note: `إيراد — ${input.category.trim()}: ${input.description.trim()}`,
    accountId: input.accountId,
  });
  const income: Income = {
    id: uid("inc"),
    number,
    date: input.date,
    category: input.category.trim(),
    amount: input.amount,
    accountId: input.accountId,
    description: input.description.trim(),
    reference: input.reference.trim(),
    status: "posted",
    createdBy: actor.name,
    reversedAt: null,
  };
  working.incomes.unshift(income);
  audit(working, actor, "تسجيل إيراد", `${number} — ${income.category} — ${input.amount}`);
  setCache(working);
  emit();
  return income;
}

export function reverseIncome(actor: User, id: string): Income {
  requirePermission(actor, "approve");
  const data = load();
  const inc = data.incomes.find((x) => x.id === id);
  if (!inc) throw new ValidationError("الإيراد غير موجود.");
  if (inc.status === "reversed") throw new ValidationError("الإيراد معكوس بالفعل.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wInc = working.incomes.find((x) => x.id === id)!;
  postCash(working, actor, {
    date: new Date().toISOString(),
    type: "adjustment",
    amount: -wInc.amount,
    reference: wInc.number,
    note: `عكس إيراد ${wInc.number}`,
    accountId: wInc.accountId,
    sourceId: wInc.id,
  });
  wInc.status = "reversed";
  wInc.reversedAt = new Date().toISOString();
  audit(working, actor, "عكس إيراد", wInc.number);
  setCache(working);
  emit();
  return wInc;
}

export function incomesTotal(): number {
  return sumMoney(load().incomes.filter((i) => i.status === "posted").map((i) => i.amount));
}

/* ======================= SALES INVOICES =========================== */

export interface InvoiceInput {
  customerId: string;
  warehouseId: string;
  date: string;
  lines: InvoiceLine[];
  paid: number;
  paymentMethod: Invoice["paymentMethod"];
  accountId: string;
  notes: string;
}

function normalizeLines(data: AppData, lines: InvoiceLine[]): InvoiceLine[] {
  return lines.map((l) => {
    const p = findProduct(data, l.productId);
    return {
      ...l,
      productName: p.name,
      unitId: p.unitId,
      returnedQty: l.returnedQty ?? 0,
    };
  });
}

export function saveInvoiceDraft(actor: User, input: InvoiceInput, id?: string): Invoice {
  requirePermission(actor, id ? "edit" : "create");
  const data = load();
  if (!input.customerId) throw new ValidationError("يجب اختيار العميل.");
  if (!input.warehouseId) throw new ValidationError("يجب اختيار المخزن.");
  validateLines(data, input.lines, true, input.warehouseId);
  const totals = computeTotals(input.lines);
  if (input.paid < 0) throw new ValidationError("المبلغ المدفوع لا يمكن أن يكون سالبًا.");
  if (input.paid > totals.total) throw new ValidationError("المبلغ المدفوع أكبر من إجمالي الفاتورة.");
  const lines = normalizeLines(data, input.lines);
  if (id) {
    const inv = data.invoices.find((i) => i.id === id);
    if (!inv) throw new ValidationError("الفاتورة غير موجودة.");
    if (inv.status !== "draft") throw new ValidationError("لا يمكن تعديل فاتورة مكتملة. استخدم الإرجاع.");
    Object.assign(inv, input, { lines, ...totals });
    audit(data, actor, "تعديل مسودة بيع", inv.number);
    emit();
    return inv;
  }
  const number = nextNumber(data, "sales", "INV");
  const customer = data.customers.find((c) => c.id === input.customerId);
  const inv: Invoice = {
    id: uid("inv"),
    number,
    date: input.date,
    customerId: input.customerId,
    customerName: customer?.name ?? "—",
    warehouseId: input.warehouseId,
    status: "draft",
    lines,
    ...totals,
    paid: input.paid,
    paymentMethod: input.paymentMethod,
    accountId: input.accountId,
    notes: input.notes,
    createdBy: actor.name,
    finalizedAt: null,
  };
  data.invoices.unshift(inv);
  audit(data, actor, "إنشاء مسودة بيع", `${number} — ${inv.customerName}`);
  emit();
  return inv;
}

export function finalizeInvoice(actor: User, id: string): Invoice {
  requirePermission(actor, "approve");
  const data = load();
  const inv = data.invoices.find((i) => i.id === id);
  if (!inv) throw new ValidationError("الفاتورة غير موجودة.");
  if (inv.status !== "draft") throw new ValidationError("الفاتورة مكتملة بالفعل.");
  validateLines(data, inv.lines, true, inv.warehouseId);
  const customer = data.customers.find((c) => c.id === inv.customerId);
  if (!customer) throw new ValidationError("العميل غير موجود.");
  if (!customer.active) throw new ValidationError("العميل معطّل.");

  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wInv = working.invoices.find((i) => i.id === id)!;
  const wCustomer = working.customers.find((c) => c.id === inv.customerId)!;

  for (const line of wInv.lines) {
    recordMovement(working, actor, {
      date: wInv.date,
      productId: line.productId,
      warehouseId: wInv.warehouseId,
      qty: -line.quantity,
      type: "sale",
      reference: wInv.number,
      reason: `بيع للعميل ${wInv.customerName}`,
    });
  }
  wInv.status = "finalized";
  wInv.finalizedAt = new Date().toISOString();
  wCustomer.balance = addMoney(wCustomer.balance, subMoney(wInv.total, wInv.paid));
  if (wInv.paid > 0) {
    postCash(working, actor, {
      date: wInv.date,
      type: "sale",
      amount: wInv.paid,
      reference: wInv.number,
      note: `تحصيل فاتورة بيع — ${wInv.customerName}`,
      accountId: wInv.accountId,
    });
  }
  audit(working, actor, "اعتماد فاتورة بيع", `${wInv.number} — ${wInv.customerName}`);
  setCache(working);
  emit();
  return wInv;
}

export function cancelInvoice(actor: User, id: string): Invoice {
  requirePermission(actor, "approve");
  const data = load();
  const inv = data.invoices.find((i) => i.id === id);
  if (!inv) throw new ValidationError("الفاتورة غير موجودة.");
  if (inv.status === "cancelled") throw new ValidationError("الفاتورة ملغاة بالفعل.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wInv = working.invoices.find((i) => i.id === id)!;
  const wCustomer = working.customers.find((c) => c.id === inv.customerId);
  if (wInv.status === "finalized") {
    for (const line of wInv.lines) {
      recordMovement(working, actor, {
        date: new Date().toISOString(),
        productId: line.productId,
        warehouseId: wInv.warehouseId,
        qty: line.quantity,
        type: "adjustment-in",
        reference: wInv.number,
        reason: `إلغاء فاتورة بيع ${wInv.number}`,
      });
    }
    if (wCustomer) wCustomer.balance = subMoney(wCustomer.balance, subMoney(wInv.total, wInv.paid));
    if (wInv.paid > 0) {
      postCash(working, actor, {
        date: new Date().toISOString(),
        type: "adjustment",
        amount: -wInv.paid,
        reference: wInv.number,
        note: `إلغاء فاتورة بيع — ${wInv.customerName}`,
        accountId: wInv.accountId,
      });
    }
  }
  wInv.status = "cancelled";
  audit(working, actor, "إلغاء فاتورة بيع", wInv.number);
  setCache(working);
  emit();
  return wInv;
}

/* ====================== SALES RETURNS ============================= */

export interface ReturnLineInput {
  productId: string;
  quantity: number;
}

export function createSalesReturn(
  actor: User,
  input: { invoiceId: string; date: string; reason: string; restock: boolean; refundAccountId: string; lines: ReturnLineInput[] },
): SalesReturn {
  requirePermission(actor, "approve");
  const data = load();
  const inv = data.invoices.find((i) => i.id === input.invoiceId);
  if (!inv) throw new ValidationError("الفاتورة غير موجودة.");
  if (inv.status !== "finalized") throw new ValidationError("يمكن الإرجاع من فاتورة مكتملة فقط.");
  if (!input.reason.trim()) throw new ValidationError("سبب الإرجاع مطلوب.");
  const selected = input.lines.filter((l) => l.quantity > 0);
  if (selected.length === 0) throw new ValidationError("يجب تحديد كمية إرجاع واحدة على الأقل.");

  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wInv = working.invoices.find((i) => i.id === input.invoiceId)!;
  const wCustomer = working.customers.find((c) => c.id === inv.customerId);
  const returnLines = [];

  for (const sel of selected) {
    const line = wInv.lines.find((l) => l.productId === sel.productId);
    if (!line) throw new ValidationError("البند غير موجود في الفاتورة.");
    const available = line.quantity - (line.returnedQty ?? 0);
    if (sel.quantity > available) {
      throw new ValidationError(`كمية الإرجاع من «${line.productName}» (${sel.quantity}) أكبر من المتاح للإرجاع (${available}).`);
    }
    line.returnedQty = round2((line.returnedQty ?? 0) + sel.quantity);
    const amount = round2(line.unitPrice * sel.quantity);
    returnLines.push({ productId: line.productId, productName: line.productName, quantity: sel.quantity, unitPrice: line.unitPrice, amount });
    if (input.restock) {
      recordMovement(working, actor, {
        date: input.date,
        productId: line.productId,
        warehouseId: wInv.warehouseId,
        qty: sel.quantity,
        type: "sales-return",
        reference: wInv.number,
        reason: `مرتجع بيع — ${input.reason.trim()}`,
      });
    }
  }

  const total = sumMoney(returnLines.map((l) => l.amount));
  const number = nextNumber(working, "salesReturn", "SRT");
  const ret: SalesReturn = {
    id: uid("srt"),
    number,
    date: input.date,
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    customerId: inv.customerId,
    customerName: inv.customerName,
    reason: input.reason.trim(),
    restock: input.restock,
    refundAccountId: input.refundAccountId,
    lines: returnLines,
    total,
    createdBy: actor.name,
  };
  working.salesReturns.unshift(ret);
  if (wCustomer) wCustomer.balance = subMoney(wCustomer.balance, total);
  postCash(working, actor, {
    date: input.date,
    type: "sales-return",
    amount: -total,
    reference: number,
    note: `مرتجع بيع — ${inv.customerName}`,
    accountId: input.refundAccountId,
  });
  audit(working, actor, "مرتجع بيع", `${number} من ${inv.number}`);
  setCache(working);
  emit();
  return ret;
}

/* ===================== PURCHASE INVOICES ========================== */

export interface PurchaseInput {
  supplierId: string;
  warehouseId: string;
  date: string;
  supplierRef: string;
  lines: InvoiceLine[];
  paid: number;
  paymentMethod: Purchase["paymentMethod"];
  accountId: string;
  notes: string;
}

export function savePurchaseDraft(actor: User, input: PurchaseInput, id?: string): Purchase {
  requirePermission(actor, id ? "edit" : "create");
  const data = load();
  if (!input.supplierId) throw new ValidationError("يجب اختيار المورد.");
  if (!input.warehouseId) throw new ValidationError("يجب اختيار المخزن.");
  validateLines(data, input.lines, false, input.warehouseId);
  const totals = computeTotals(input.lines);
  if (input.paid < 0) throw new ValidationError("المبلغ المدفوع لا يمكن أن يكون سالبًا.");
  if (input.paid > totals.total) throw new ValidationError("المبلغ المدفوع أكبر من إجمالي الفاتورة.");
  const lines = normalizeLines(data, input.lines);
  if (id) {
    const pur = data.purchases.find((p) => p.id === id);
    if (!pur) throw new ValidationError("الفاتورة غير موجودة.");
    if (pur.status !== "draft") throw new ValidationError("لا يمكن تعديل فاتورة مكتملة. استخدم الإرجاع.");
    Object.assign(pur, input, { lines, ...totals });
    audit(data, actor, "تعديل مسودة شراء", pur.number);
    emit();
    return pur;
  }
  const number = nextNumber(data, "purchases", "PUR");
  const supplier = data.suppliers.find((s) => s.id === input.supplierId);
  const pur: Purchase = {
    id: uid("pur"),
    number,
    date: input.date,
    supplierId: input.supplierId,
    supplierName: supplier?.name ?? "—",
    warehouseId: input.warehouseId,
    supplierRef: input.supplierRef.trim(),
    status: "draft",
    lines,
    ...totals,
    paid: input.paid,
    paymentMethod: input.paymentMethod,
    accountId: input.accountId,
    notes: input.notes,
    createdBy: actor.name,
    finalizedAt: null,
  };
  data.purchases.unshift(pur);
  audit(data, actor, "إنشاء مسودة شراء", `${number} — ${pur.supplierName}`);
  emit();
  return pur;
}

export function finalizePurchase(actor: User, id: string): Purchase {
  requirePermission(actor, "approve");
  const data = load();
  const pur = data.purchases.find((p) => p.id === id);
  if (!pur) throw new ValidationError("الفاتورة غير موجودة.");
  if (pur.status !== "draft") throw new ValidationError("الفاتورة مكتملة بالفعل.");
  validateLines(data, pur.lines, false, pur.warehouseId);
  const supplier = data.suppliers.find((s) => s.id === pur.supplierId);
  if (!supplier) throw new ValidationError("المورد غير موجود.");
  if (!supplier.active) throw new ValidationError("المورد معطّل.");

  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wPur = working.purchases.find((p) => p.id === id)!;
  const wSupplier = working.suppliers.find((s) => s.id === pur.supplierId)!;

  for (const line of wPur.lines) {
    recordMovement(working, actor, {
      date: wPur.date,
      productId: line.productId,
      warehouseId: wPur.warehouseId,
      qty: line.quantity,
      type: "purchase",
      reference: wPur.number,
      reason: `شراء من المورد ${wPur.supplierName}`,
    });
  }
  wPur.status = "finalized";
  wPur.finalizedAt = new Date().toISOString();
  wSupplier.balance = addMoney(wSupplier.balance, subMoney(wPur.total, wPur.paid));
  if (wPur.paid > 0) {
    postCash(working, actor, {
      date: wPur.date,
      type: "purchase",
      amount: -wPur.paid,
      reference: wPur.number,
      note: `دفعة فاتورة شراء — ${wPur.supplierName}`,
      accountId: wPur.accountId,
    });
  }
  audit(working, actor, "اعتماد فاتورة شراء", `${wPur.number} — ${wPur.supplierName}`);
  setCache(working);
  emit();
  return wPur;
}

export function cancelPurchase(actor: User, id: string): Purchase {
  requirePermission(actor, "approve");
  const data = load();
  const pur = data.purchases.find((p) => p.id === id);
  if (!pur) throw new ValidationError("الفاتورة غير موجودة.");
  if (pur.status === "cancelled") throw new ValidationError("الفاتورة ملغاة بالفعل.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wPur = working.purchases.find((p) => p.id === id)!;
  const wSupplier = working.suppliers.find((s) => s.id === pur.supplierId);
  if (wPur.status === "finalized") {
    for (const line of wPur.lines) {
      recordMovement(working, actor, {
        date: new Date().toISOString(),
        productId: line.productId,
        warehouseId: wPur.warehouseId,
        qty: -line.quantity,
        type: "adjustment-out",
        reference: wPur.number,
        reason: `إلغاء فاتورة شراء ${wPur.number}`,
      });
    }
    if (wSupplier) wSupplier.balance = subMoney(wSupplier.balance, subMoney(wPur.total, wPur.paid));
    if (wPur.paid > 0) {
      postCash(working, actor, {
        date: new Date().toISOString(),
        type: "adjustment",
        amount: wPur.paid,
        reference: wPur.number,
        note: `إلغاء فاتورة شراء — ${wPur.supplierName}`,
        accountId: wPur.accountId,
      });
    }
  }
  wPur.status = "cancelled";
  audit(working, actor, "إلغاء فاتورة شراء", wPur.number);
  setCache(working);
  emit();
  return wPur;
}

/* ==================== PURCHASE RETURNS ============================ */

export function createPurchaseReturn(
  actor: User,
  input: { purchaseId: string; date: string; reason: string; restock: boolean; refundAccountId: string; lines: ReturnLineInput[] },
): PurchaseReturn {
  requirePermission(actor, "approve");
  const data = load();
  const pur = data.purchases.find((p) => p.id === input.purchaseId);
  if (!pur) throw new ValidationError("الفاتورة غير موجودة.");
  if (pur.status !== "finalized") throw new ValidationError("يمكن الإرجاع من فاتورة مكتملة فقط.");
  if (!input.reason.trim()) throw new ValidationError("سبب الإرجاع مطلوب.");
  const selected = input.lines.filter((l) => l.quantity > 0);
  if (selected.length === 0) throw new ValidationError("يجب تحديد كمية إرجاع واحدة على الأقل.");

  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wPur = working.purchases.find((p) => p.id === input.purchaseId)!;
  const wSupplier = working.suppliers.find((s) => s.id === pur.supplierId);
  const returnLines = [];

  for (const sel of selected) {
    const line = wPur.lines.find((l) => l.productId === sel.productId);
    if (!line) throw new ValidationError("البند غير موجود في الفاتورة.");
    const available = line.quantity - (line.returnedQty ?? 0);
    if (sel.quantity > available) {
      throw new ValidationError(`كمية الإرجاع من «${line.productName}» (${sel.quantity}) أكبر من المتاح للإرجاع (${available}).`);
    }
    line.returnedQty = round2((line.returnedQty ?? 0) + sel.quantity);
    const amount = round2(line.unitPrice * sel.quantity);
    returnLines.push({ productId: line.productId, productName: line.productName, quantity: sel.quantity, unitPrice: line.unitPrice, amount });
    if (input.restock) {
      recordMovement(working, actor, {
        date: input.date,
        productId: line.productId,
        warehouseId: wPur.warehouseId,
        qty: -sel.quantity,
        type: "purchase-return",
        reference: wPur.number,
        reason: `مرتجع شراء — ${input.reason.trim()}`,
      });
    }
  }

  const total = sumMoney(returnLines.map((l) => l.amount));
  const number = nextNumber(working, "purchaseReturn", "PRT");
  const ret: PurchaseReturn = {
    id: uid("prt"),
    number,
    date: input.date,
    purchaseId: pur.id,
    purchaseNumber: pur.number,
    supplierId: pur.supplierId,
    supplierName: pur.supplierName,
    reason: input.reason.trim(),
    restock: input.restock,
    refundAccountId: input.refundAccountId,
    lines: returnLines,
    total,
    createdBy: actor.name,
  };
  working.purchaseReturns.unshift(ret);
  if (wSupplier) wSupplier.balance = subMoney(wSupplier.balance, total);
  postCash(working, actor, {
    date: input.date,
    type: "purchase-return",
    amount: total,
    reference: number,
    note: `مرتجع شراء — ${pur.supplierName}`,
    accountId: input.refundAccountId,
  });
  audit(working, actor, "مرتجع شراء", `${number} من ${pur.number}`);
  setCache(working);
  emit();
  return ret;
}

/* ====================== WAREHOUSE TRANSFERS ======================= */

export interface TransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  lines: TransferLine[];
  notes: string;
}

export function saveTransferDraft(actor: User, input: TransferInput): Transfer {
  requirePermission(actor, "create");
  const data = load();
  if (!input.fromWarehouseId || !input.toWarehouseId) throw new ValidationError("يجب اختيار المخزنين.");
  if (input.fromWarehouseId === input.toWarehouseId) throw new ValidationError("لا يمكن التحويل إلى نفس المخزن.");
  const from = findWarehouse(data, input.fromWarehouseId);
  const to = findWarehouse(data, input.toWarehouseId);
  if (!from.active || !to.active) throw new ValidationError("لا يمكن التحويل من أو إلى مخزن معطّل.");
  const lines = input.lines.filter((l) => l.productId && l.quantity > 0);
  if (lines.length === 0) throw new ValidationError("يجب إضافة بند واحد على الأقل بكمية أكبر من صفر.");
  for (const line of lines) {
    const p = findProduct(data, line.productId);
    const available = warehouseQty(data, line.productId, input.fromWarehouseId);
    if (line.quantity > available) {
      throw new ValidationError(`الكمية المطلوبة من «${p.name}» (${line.quantity}) أكبر من المتاح في «${from.name}» (${available}).`);
    }
  }
  const number = nextNumber(data, "transfer", "TRN");
  const transfer: Transfer = {
    id: uid("trn"),
    number,
    date: input.date,
    fromWarehouseId: input.fromWarehouseId,
    fromWarehouseName: from.name,
    toWarehouseId: input.toWarehouseId,
    toWarehouseName: to.name,
    status: "draft",
    lines: lines.map((l) => ({ ...l, productName: findProduct(data, l.productId).name })),
    notes: input.notes.trim(),
    createdBy: actor.name,
    completedAt: null,
  };
  data.transfers.unshift(transfer);
  audit(data, actor, "إنشاء مسودة تحويل مخزني", `${number}: ${from.name} ← ${to.name}`);
  emit();
  return transfer;
}

export function completeTransfer(actor: User, id: string): Transfer {
  requirePermission(actor, "approve");
  const data = load();
  const transfer = data.transfers.find((t) => t.id === id);
  if (!transfer) throw new ValidationError("التحويل غير موجود.");
  if (transfer.status !== "draft") throw new ValidationError("التحويل مكتمل بالفعل.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const wT = working.transfers.find((t) => t.id === id)!;
  for (const line of wT.lines) {
    recordMovement(working, actor, {
      date: wT.date,
      productId: line.productId,
      warehouseId: wT.fromWarehouseId,
      qty: -line.quantity,
      type: "transfer-out",
      reference: wT.number,
      reason: `تحويل إلى ${wT.toWarehouseName}`,
    });
    recordMovement(working, actor, {
      date: wT.date,
      productId: line.productId,
      warehouseId: wT.toWarehouseId,
      qty: line.quantity,
      type: "transfer-in",
      reference: wT.number,
      reason: `تحويل من ${wT.fromWarehouseName}`,
    });
  }
  wT.status = "completed";
  wT.completedAt = new Date().toISOString();
  audit(working, actor, "اعتماد تحويل مخزني", wT.number);
  setCache(working);
  emit();
  return wT;
}

export function cancelTransfer(actor: User, id: string): Transfer {
  requirePermission(actor, "approve");
  const data = load();
  const transfer = data.transfers.find((t) => t.id === id);
  if (!transfer) throw new ValidationError("التحويل غير موجود.");
  if (transfer.status === "cancelled") throw new ValidationError("التحويل ملغى بالفعل.");
  if (transfer.status === "completed") throw new ValidationError("لا يمكن إلغاء تحويل مكتمل.");
  transfer.status = "cancelled";
  audit(data, actor, "إلغاء تحويل مخزني", transfer.number);
  emit();
  return transfer;
}

/* ====================== STOCK ADJUSTMENTS ========================= */

export interface AdjustmentInput {
  date: string;
  warehouseId: string;
  productId: string;
  direction: "increase" | "decrease";
  /** Always a positive number; `direction` decides the sign. */
  quantity: number;
  reason: string;
}

export function createAdjustment(actor: User, input: AdjustmentInput): Adjustment {
  requirePermission(actor, "approve");
  const data = load();
  if (!input.warehouseId) throw new ValidationError("يجب اختيار المخزن.");
  if (!input.productId) throw new ValidationError("يجب اختيار المنتج.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new ValidationError("الكمية يجب أن تكون أكبر من صفر.");
  if (!input.reason.trim()) throw new ValidationError("سبب التسوية مطلوب.");
  const working = JSON.parse(JSON.stringify(data)) as AppData;
  const warehouse = findWarehouse(working, input.warehouseId);
  const product = findProduct(working, input.productId);
  const beforeQty = warehouseQty(working, input.productId, input.warehouseId);
  const signedQty = input.direction === "increase" ? input.quantity : -input.quantity;
  const number = nextNumber(working, "adjustment", "ADJ");
  recordMovement(working, actor, {
    date: input.date,
    productId: input.productId,
    warehouseId: input.warehouseId,
    qty: signedQty,
    type: signedQty > 0 ? "adjustment-in" : "adjustment-out",
    reference: number,
    reason: input.reason.trim(),
  });
  const afterQty = warehouseQty(working, input.productId, input.warehouseId);
  const adjustment: Adjustment = {
    id: uid("adj"),
    number,
    date: input.date,
    productId: input.productId,
    productName: product.name,
    warehouseId: input.warehouseId,
    warehouseName: warehouse.name,
    direction: input.direction,
    quantity: input.quantity,
    reason: input.reason.trim(),
    beforeQty,
    afterQty,
    createdBy: actor.name,
  };
  working.adjustments.unshift(adjustment);
  audit(working, actor, "تسوية مخزنية", `${number} — ${product.name} — ${signedQty > 0 ? "+" : ""}${signedQty}`);
  setCache(working);
  persist();
  emit();
  return adjustment;
}

/* ============================ SETTINGS ============================ */

export function saveSettings(actor: User, input: Settings): Settings {
  requirePermission(actor, "edit");
  const data = load();
  if (!input.companyName.trim()) throw new ValidationError("اسم الشركة مطلوب.");
  if (!input.currency.trim()) throw new ValidationError("العملة مطلوبة.");
  if (input.taxPercent < 0 || input.taxPercent > 100) throw new ValidationError("نسبة الضريبة يجب أن تكون بين 0 و 100.");
  Object.assign(data.settings, input, { companyName: input.companyName.trim(), currency: input.currency.trim() });
  audit(data, actor, "تحديث الإعدادات", input.companyName);
  emit();
  return data.settings;
}

export function saveUser(actor: User, input: Omit<User, "id"> & { id?: string }): User {
  requirePermission(actor, "edit");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم المستخدم مطلوب.");
  if (!input.username.trim()) throw new ValidationError("اسم الدخول مطلوب.");
  const dup = data.users.find((u) => u.username.toLowerCase() === input.username.trim().toLowerCase() && u.id !== input.id);
  if (dup) throw new ValidationError("اسم الدخول مستخدم بالفعل.");
  if (input.id) {
    const existing = data.users.find((u) => u.id === input.id);
    if (!existing) throw new ValidationError("المستخدم غير موجود.");
    Object.assign(existing, input, { name: input.name.trim(), username: input.username.trim() });
    audit(data, actor, "تعديل مستخدم", existing.name);
    emit();
    return existing;
  }
  const user: User = { ...input, id: uid("u"), name: input.name.trim(), username: input.username.trim() };
  data.users.unshift(user);
  audit(data, actor, "إضافة مستخدم", user.name);
  emit();
  return user;
}

export function resetData(actor: User): void {
  requirePermission(actor, "delete");
  setCache(seed());
  persist();
  emit();
}

export function exportBackup(): string {
  return JSON.stringify(load(), null, 2);
}

export function importBackup(actor: User, json: string): void {
  requirePermission(actor, "delete");
  const parsed = JSON.parse(json) as AppData;
  if (!parsed || !Array.isArray(parsed.products)) throw new ValidationError("ملف النسخة الاحتياطية غير صالح.");
  setCache(parsed);
  persist();
  emit();
}

/* ==================== COMPATIBILITY EXPORTS ======================= */
/* Additive only — nothing existing is renamed or removed. These are the
   seven names App.tsx imports that were previously missing. */

/** Alias for createExpense — App.tsx imports it as `addExpense`. */
export function addExpense(actor: User, input: ExpenseInput): Expense {
  return createExpense(actor, input);
}

/** Create + finalize a sales invoice in one call. */
export function createInvoice(actor: User, input: InvoiceInput): Invoice {
  const draft = saveInvoiceDraft(actor, input);
  return finalizeInvoice(actor, draft.id);
}

/** Alias for exportBackup — App.tsx imports it as `exportJson`. */
export function exportJson(): string {
  return exportBackup();
}

/** Total inventory value at cost price across all products. */
export function inventoryValue(): number {
  const data = load();
  return sumMoney(data.products.map((p) => round2(p.costPrice * p.stock)));
}

/** Products whose stock is at or below their reorder level. */
export function lowStockProducts(): Product[] {
  return load()
    .products.filter((p) => p.active && p.stock <= p.reorderLevel)
    .sort((a, b) => a.stock - b.stock);
}

/** Sum of all customer outstanding balances (receivables). */
export function receivablesTotal(): number {
  return sumMoney(load().customers.map((c) => c.balance));
}

/** Sum of all finalized sales invoice totals. */
export function salesTotal(): number {
  return sumMoney(load().invoices.filter((i) => i.status === "finalized").map((i) => i.total));
}

/** Create + finalize a purchase invoice in one call. */
export function createPurchase(actor: User, input: PurchaseInput): Purchase {
  const draft = savePurchaseDraft(actor, input);
  return finalizePurchase(actor, draft.id);
}

/* ========================= EMPLOYEES & TAXES ====================== */

export function saveEmployee(actor: User, input: Omit<Employee, "id"> & { id?: string }): Employee {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم الموظف مطلوب.");
  if (!Number.isFinite(input.salary) || input.salary < 0) throw new ValidationError("الراتب لا يمكن أن يكون سالبًا.");
  if (input.id) {
    const existing = data.employees.find((e) => e.id === input.id);
    if (!existing) throw new ValidationError("الموظف غير موجود.");
    Object.assign(existing, input, { name: input.name.trim(), position: input.position.trim(), phone: input.phone.trim() });
    audit(data, actor, "تعديل موظف", existing.name);
    persist();
    emit();
    return existing;
  }
  const emp: Employee = {
    ...input,
    id: uid("emp"),
    name: input.name.trim(),
    position: input.position.trim(),
    phone: input.phone.trim(),
  };
  data.employees.unshift(emp);
  audit(data, actor, "إضافة موظف", emp.name);
  persist();
  emit();
  return emp;
}

export function saveTax(actor: User, input: Omit<TaxRule, "id"> & { id?: string }): TaxRule {
  requirePermission(actor, input.id ? "edit" : "create");
  const data = load();
  if (!input.name.trim()) throw new ValidationError("اسم الضريبة مطلوب.");
  if (!Number.isFinite(input.percent) || input.percent < 0 || input.percent > 100) {
    throw new ValidationError("نسبة الضريبة يجب أن تكون بين 0 و 100.");
  }
  if (input.id) {
    const existing = data.taxes.find((t) => t.id === input.id);
    if (!existing) throw new ValidationError("الضريبة غير موجودة.");
    Object.assign(existing, input, { name: input.name.trim() });
    audit(data, actor, "تعديل ضريبة", existing.name);
    persist();
    emit();
    return existing;
  }
  const tax: TaxRule = { ...input, id: uid("tax"), name: input.name.trim() };
  data.taxes.unshift(tax);
  audit(data, actor, "إضافة ضريبة", tax.name);
  persist();
  emit();
  return tax;
}

/* ============================= HOOK =============================== */

import { useSyncExternalStore } from "react";

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}