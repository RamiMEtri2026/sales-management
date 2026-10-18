export type Role = "admin" | "manager" | "cashier" | "viewer";
export type Permission = "view" | "create" | "edit" | "delete" | "approve" | "print" | "export";

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  unitId: string;
  costPrice: number;
  salePrice: number;
  /** Derived total across all warehouses. Reconciled from stockMovements. */
  stock: number;
  reorderLevel: number;
  active: boolean;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  openingBalance: number;
  balance: number;
  active: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  openingBalance: number;
  balance: number;
  active: boolean;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string;
  description: string;
  active: boolean;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  kind: "cashbox" | "bank";
  openingBalance: number;
  active: boolean;
}

export type PaymentMethod = "cash" | "bank" | "credit";

export interface InvoiceLine {
  productId: string;
  productName: string;
  unitId: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxPercent: number;
  returnedQty: number;
}

export type DocStatus = "draft" | "finalized" | "cancelled";

export interface Invoice {
  id: string;
  number: string;
  date: string;
  customerId: string;
  customerName: string;
  warehouseId: string;
  status: DocStatus;
  lines: InvoiceLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paid: number;
  paymentMethod: PaymentMethod;
  accountId: string;
  notes: string;
  createdBy: string;
  finalizedAt: string | null;
}

export interface Purchase {
  id: string;
  number: string;
  date: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  supplierRef: string;
  status: DocStatus;
  lines: InvoiceLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paid: number;
  paymentMethod: PaymentMethod;
  accountId: string;
  notes: string;
  createdBy: string;
  finalizedAt: string | null;
}

export interface SalesReturnLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface SalesReturn {
  id: string;
  number: string;
  date: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  reason: string;
  restock: boolean;
  refundAccountId: string;
  lines: SalesReturnLine[];
  total: number;
  createdBy: string;
}

export interface PurchaseReturn {
  id: string;
  number: string;
  date: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  reason: string;
  restock: boolean;
  refundAccountId: string;
  lines: SalesReturnLine[];
  total: number;
  createdBy: string;
}

export type CashType =
  | "sale"
  | "purchase"
  | "receipt"
  | "payment"
  | "expense"
  | "income"
  | "sales-return"
  | "purchase-return"
  | "transfer-in"
  | "transfer-out"
  | "adjustment";

export interface CashMovement {
  id: string;
  date: string;
  type: CashType;
  amount: number;
  reference: string;
  note: string;
  accountId: string;
  /** Optional link to the voucher/transfer/expense that produced this movement. */
  sourceId?: string;
  user?: string;
}

/* ------------------------- Phase 5: vouchers ------------------------- */

export type VoucherKind = "receipt" | "payment";

export type ReceiptType = "customer-payment" | "other-income" | "supplier-refund";
export type PaymentType = "supplier-payment" | "customer-refund" | "expense" | "employee" | "other";

export type VoucherStatus = "posted" | "reversed";

export interface Voucher {
  id: string;
  number: string;
  kind: VoucherKind;
  /** ReceiptType when kind === "receipt", PaymentType when kind === "payment". */
  subtype: string;
  date: string;
  amount: number;
  accountId: string;
  paymentMethod: PaymentMethod;
  /** Customer id, supplier id, or employee id depending on subtype. */
  partyId: string;
  partyName: string;
  /** Optional link to an invoice/purchase/expense. */
  relatedRef: string;
  description: string;
  status: VoucherStatus;
  createdBy: string;
  reversedAt: string | null;
}

/* ----------------------- Phase 5: account transfers ------------------ */

export interface AccountTransfer {
  id: string;
  number: string;
  date: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  description: string;
  createdBy: string;
}

/* ----------------------- Phase 5: expense categories ----------------- */

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Expense {
  id: string;
  number: string;
  date: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  accountId: string;
  description: string;
  reference: string;
  status: VoucherStatus;
  createdBy: string;
  reversedAt: string | null;
}

export interface Income {
  id: string;
  number: string;
  date: string;
  category: string;
  amount: number;
  accountId: string;
  description: string;
  reference: string;
  status: VoucherStatus;
  createdBy: string;
  reversedAt: string | null;
}

export interface Employee {
  id: string;
  name: string;
  position: string;
  phone: string;
  salary: number;
  active: boolean;
}

export interface TaxRule {
  id: string;
  name: string;
  percent: number;
  appliesTo: "sales" | "purchases" | "both";
  active: boolean;
}

export interface AuditEntry {
  id: string;
  date: string;
  user: string;
  action: string;
  detail: string;
}

/* ------------------------- Phase 4: inventory ------------------------- */

export type MovementType =
  | "purchase"
  | "sale"
  | "sales-return"
  | "purchase-return"
  | "transfer-out"
  | "transfer-in"
  | "adjustment-in"
  | "adjustment-out"
  | "opening";

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  type: MovementType;
  reference: string;
  reason: string;
  user: string;
  balanceAfter: number;
}

export interface TransferLine {
  productId: string;
  productName: string;
  quantity: number;
}

export type TransferStatus = "draft" | "completed" | "cancelled";

export interface Transfer {
  id: string;
  number: string;
  date: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  status: TransferStatus;
  lines: TransferLine[];
  notes: string;
  createdBy: string;
  completedAt: string | null;
}

export interface Adjustment {
  id: string;
  number: string;
  date: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  direction: "increase" | "decrease";
  quantity: number;
  reason: string;
  beforeQty: number;
  afterQty: number;
  createdBy: string;
}

export interface Settings {
  companyName: string;
  currency: string;
  taxPercent: number;
  stockControl: boolean;
  allowNegativeStock: boolean;
}

export interface AppData {
  users: User[];
  categories: Category[];
  units: Unit[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  accounts: Account[];
  invoices: Invoice[];
  purchases: Purchase[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  cash: CashMovement[];
  vouchers: Voucher[];
  accountTransfers: AccountTransfer[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  incomes: Income[];
  employees: Employee[];
  taxes: TaxRule[];
  audit: AuditEntry[];
  stockMovements: StockMovement[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  settings: Settings;
  counters: Record<string, number>;
}

export interface LineTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}