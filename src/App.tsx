import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Users,
  UserRound,
  ReceiptText,
  ShoppingCart,
  Undo2,
  Boxes,
  Tags,
  Warehouse,
  ArrowLeftRight,
  Scale,
  History,
  Wallet,
  ScrollText,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Settings as SettingsIcon,
  ShieldCheck,
  RotateCcw,
  Download,
  Upload,
  AlertTriangle,
  CircleDollarSign,
  UsersRound,
  Receipt,
  Landmark,
  BriefcaseBusiness,
  Percent,
  UserCog,
  ListTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAppData, EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/modules";
import {
  SalesModule,
  PurchasesModule,
  SalesReturnsModule,
  PurchaseReturnsModule,
  CashboxesModule,
  ReceiptsPaymentsModule,
  ExpensesModule,
  EmployeesModule,
  TaxesModule,
  UsersModule,
  AuditLogModule,
} from "@/components/modules";
import {
  CustomersModule,
  SuppliersModule,
  ProductsModule,
  CategoriesModule,
} from "@/components/master";
import {
  WarehousesModule,
  TransfersModule,
  AdjustmentsModule,
  MovementsModule,
} from "@/components/inventory";
import {
  can,
  cashBalance,
  expensesTotal,
  exportBackup,
  importBackup,
  incomesTotal,
  inventoryValue,
  lowStockProducts,
  receivablesTotal,
  resetData,
  saveSettings,
  salesTotal,
} from "@/lib/store";
import type { Settings, User } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { dataSourceLabel, isApiMode } from "@/lib/dataSource";

/* ------------------------------- Tabs ------------------------------ */

type Tab =
  | "dashboard"
  | "sales"
  | "purchases"
  | "sales-returns"
  | "purchase-returns"
  | "products"
  | "categories"
  | "warehouses"
  | "transfers"
  | "adjustments"
  | "movements"
  | "customers"
  | "suppliers"
  | "cashboxes"
  | "receipts-payments"
  | "expenses"
  | "employees"
  | "taxes"
  | "reports"
  | "users"
  | "audit"
  | "settings";

interface TabDef {
  id: Tab;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_GROUPS: { title: string; items: TabDef[] }[] = [
  {
    title: "الرئيسية",
    items: [
      { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
      { id: "reports", label: "التقارير", icon: BarChart3 },
    ],
  },
  {
    title: "المبيعات والمشتريات",
    items: [
      { id: "sales", label: "فواتير البيع", icon: ReceiptText },
      { id: "sales-returns", label: "مرتجعات البيع", icon: Undo2 },
      { id: "purchases", label: "فواتير الشراء", icon: ShoppingCart },
      { id: "purchase-returns", label: "مرتجعات الشراء", icon: RotateCcw },
    ],
  },
  {
    title: "المخزون",
    items: [
      { id: "products", label: "المنتجات", icon: Package },
      { id: "categories", label: "التصنيفات", icon: Tags },
      { id: "warehouses", label: "المخازن", icon: Warehouse },
      { id: "transfers", label: "التحويلات", icon: ArrowLeftRight },
      { id: "adjustments", label: "التسويات", icon: Scale },
      { id: "movements", label: "حركات المخزون", icon: History },
    ],
  },
  {
    title: "العملاء والموردون",
    items: [
      { id: "customers", label: "العملاء", icon: Users },
      { id: "suppliers", label: "الموردون", icon: UserRound },
    ],
  },
  {
    title: "الخزينة والمالية",
    items: [
      { id: "cashboxes", label: "الخزائن والبنوك", icon: Landmark },
      { id: "receipts-payments", label: "سندات القبض والصرف", icon: ScrollText },
      { id: "expenses", label: "المصروفات", icon: TrendingDown },
    ],
  },
  {
    title: "الموارد البشرية والضرائب",
    items: [
      { id: "employees", label: "الموظفون", icon: BriefcaseBusiness },
      { id: "taxes", label: "قواعد الضريبة", icon: Percent },
    ],
  },
  {
    title: "النظام",
    items: [
      { id: "users", label: "المستخدمون", icon: UserCog },
      { id: "audit", label: "سجل النشاط", icon: ListTree },
      { id: "settings", label: "الإعدادات", icon: SettingsIcon },
    ],
  },
];

const ALL_TABS = NAV_GROUPS.flatMap((g) => g.items);

/* ---------------------------- Dashboard ---------------------------- */

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof TrendingUp;
  tone: "emerald" | "amber" | "sky" | "rose" | "slate";
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
        </div>
        <div className={cn("rounded-xl border p-2.5", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard({ actor }: { actor: User }) {
  const data = useAppData();
  const sales = salesTotal();
  const expenses = expensesTotal();
  const incomes = incomesTotal();
  const cash = cashBalance();
  const receivables = receivablesTotal();
  const payables = data.suppliers
    .filter((s) => s.balance > 0)
    .reduce((sum, s) => sum + s.balance, 0);
  const invValue = inventoryValue();
  const low = lowStockProducts();
  const netFlow = sales + incomes - expenses;
  const recent = data.invoices.slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-slate-900">نظرة عامة على النشاط</h2>
          <p className="mt-1 text-sm text-slate-500">
            مرحبًا {actor.name} — ملخص الأداء المالي والمخزون
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="إجمالي المبيعات"
          value={formatCurrency(sales)}
          icon={TrendingUp}
          tone="emerald"
          hint={`${data.invoices.filter((i) => i.status === "finalized").length} فاتورة معتمدة`}
        />
        <StatCard title="رصيد الخزينة" value={formatCurrency(cash)} icon={CircleDollarSign} tone="sky" hint="نقدية وبنوك" />
        <StatCard title="مديونية العملاء" value={formatCurrency(receivables)} icon={Users} tone="amber" hint="مبالغ غير محصلة" />
        <StatCard title="أرصدة الموردين" value={formatCurrency(payables)} icon={UserRound} tone="rose" hint="مستحق للموردين" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="قيمة المخزون" value={formatCurrency(invValue)} icon={Boxes} tone="slate" hint="بسعر التكلفة" />
        <StatCard title="المصروفات" value={formatCurrency(expenses)} icon={TrendingDown} tone="rose" />
        <StatCard title="إيرادات أخرى" value={formatCurrency(incomes)} icon={Receipt} tone="sky" />
        <StatCard
          title="صافي التشغيل"
          value={formatCurrency(netFlow)}
          icon={Wallet}
          tone={netFlow >= 0 ? "emerald" : "amber"}
          hint="مبيعات + إيرادات − مصروفات"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">أحدث فواتير البيع</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState title="لا توجد فواتير بعد" hint="ابدأ بإنشاء فاتورة بيع من تبويب فواتير البيع." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الرقم</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.number}</TableCell>
                      <TableCell>{inv.customerName}</TableCell>
                      <TableCell>{formatDate(inv.date)}</TableCell>
                      <TableCell>{formatCurrency(inv.total)}</TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              تنبيهات المخزون
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {low.length === 0 ? (
              <p className="text-sm text-slate-500">كل المنتجات فوق حد إعادة الطلب.</p>
            ) : (
              low.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
                  <span className="text-sm font-medium text-slate-800">{p.name}</span>
                  <span className="text-sm text-amber-700">{formatNumber(p.stock)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------- Reports ----------------------------- */

function Reports({ actor }: { actor: User }) {
  const data = useAppData();
  const [error, setError] = useState("");

  const sales = salesTotal();
  const expenses = expensesTotal();
  const incomes = incomesTotal();
  const purchasesTotal = data.purchases
    .filter((p) => p.status === "finalized")
    .reduce((sum, p) => sum + p.total, 0);
  const netFlow = sales + incomes - expenses;

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const inv of data.invoices) {
      if (inv.status !== "finalized") continue;
      for (const l of inv.lines) {
        const cur = map.get(l.productId) ?? { name: l.productName, qty: 0, revenue: 0 };
        cur.qty += l.quantity;
        cur.revenue += l.unitPrice * l.quantity;
        map.set(l.productId, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [data.invoices]);

  const maxRevenue = topProducts.reduce((m, p) => Math.max(m, p.revenue), 0) || 1;

  function doExport() {
    setError("");
    try {
      if (!can(actor.role, "export")) throw new Error("لا تملك صلاحية التصدير");
      const blob = new Blob([exportBackup()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    }
  }

  function doImport(file: File) {
    setError("");
    file
      .text()
      .then((json) => importBackup(actor, json))
      .catch((e) => setError(e instanceof Error ? e.message : "تعذر قراءة الملف"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-slate-900">التقارير</h2>
          <p className="mt-1 text-sm text-slate-500">ملخص الأداء المالي وأفضل المنتجات مبيعًا</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={doExport}>
            <Download className="h-4 w-4" /> تصدير نسخة احتياطية
          </Button>
          {can(actor.role, "approve") ? (
            <label className="inline-flex">
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doImport(f);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50">
                <Upload className="h-4 w-4" /> استيراد نسخة
              </span>
            </label>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="إجمالي المبيعات" value={formatCurrency(sales)} icon={TrendingUp} tone="emerald" />
        <StatCard title="إجمالي المشتريات" value={formatCurrency(purchasesTotal)} icon={ShoppingCart} tone="slate" />
        <StatCard title="إجمالي المصروفات" value={formatCurrency(expenses)} icon={TrendingDown} tone="rose" />
        <StatCard title="إيرادات أخرى" value={formatCurrency(incomes)} icon={Receipt} tone="sky" />
        <StatCard
          title="صافي التشغيل"
          value={formatCurrency(netFlow)}
          icon={BarChart3}
          tone={netFlow >= 0 ? "emerald" : "amber"}
        />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">أفضل المنتجات مبيعًا</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {topProducts.length === 0 ? (
            <EmptyState title="لا توجد بيانات مبيعات" hint="أنشئ فواتير بيع لعرض التحليل." />
          ) : (
            topProducts.map((p) => (
              <div key={p.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className="text-slate-500">
                    {formatNumber(p.qty)} وحدة — {formatCurrency(p.revenue)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(4, (p.revenue / maxRevenue) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}

/* ---------------------------- Settings ----------------------------- */

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "مدير النظام",
    manager: "مدير",
    cashier: "كاشير",
    viewer: "مشاهدة فقط",
  };
  return map[role] ?? role;
}

function SettingsView({ actor }: { actor: User }) {
  const data = useAppData();
  const [form, setForm] = useState<Settings>(data.settings);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function submit() {
    setError("");
    setOk("");
    try {
      saveSettings(actor, form);
      setOk("تم حفظ الإعدادات بنجاح");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-slate-900">الإعدادات</h2>
          <p className="mt-1 text-sm text-slate-500">بيانات الشركة والعملة والضريبة وسياسة المخزون</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">إعدادات عامة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>اسم الشركة</Label>
                <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>العملة</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>نسبة الضريبة الافتراضية %</Label>
                <Input type="number" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.stockControl}
                  onChange={(e) => setForm({ ...form, stockControl: e.target.checked })}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span>
                  تفعيل الرقابة على المخزون
                  <span className="block text-xs text-slate-400">منع بيع كمية أكبر من المتاح في المخزن</span>
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowNegativeStock}
                  onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.checked })}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span>
                  السماح بمخزون سالب
                  <span className="block text-xs text-slate-400">يتيح إتمام الفواتير حتى لو نفدت الكمية</span>
                </span>
              </label>
            </div>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                حفظ الإعدادات
              </Button>
              {can(actor.role, "approve") ? (
                <Button
                  variant="outline"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => {
                    try {
                      resetData(actor);
                      setOk("تمت إعادة تعيين البيانات التجريبية");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "خطأ");
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> إعادة تعيين البيانات
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> المستخدمون والصلاحيات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.users.map((u) => (
                <div key={u.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{u.name}</span>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      {roleLabel(u.role)}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">{u.username}</p>
                </div>
              ))}
              <p className="text-xs text-slate-400">
                الصلاحيات مُطبَّقة في طبقة الخدمات، وليس فقط بإخفاء الأزرار.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">مصدر البيانات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>{dataSourceLabel()}</p>
              <p className="text-xs text-slate-400">
                {isApiMode()
                  ? "الواجهة تعمل في وضع الاتصال بالخادم (VITE_API_URL مضبوط)."
                  : "لم يُضبط VITE_API_URL — البيانات تُحفظ في متصفحك فقط. لتشغيل وضع الخادم أنشئ ملف .env وحدد فيه VITE_API_URL."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- App ------------------------------- */

export default function App() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [userId, setUserId] = useState<string>(data.users[0]?.id ?? "");

  const actor = data.users.find((u) => u.id === userId) ?? data.users[0];

  if (!actor) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">لا يوجد مستخدمون متاحون.</p>
      </div>
    );
  }

  function renderTab() {
    switch (tab) {
      case "dashboard":
        return <Dashboard actor={actor} />;
      case "sales":
        return <SalesModule actor={actor} />;
      case "sales-returns":
        return <SalesReturnsModule actor={actor} />;
      case "purchases":
        return <PurchasesModule actor={actor} />;
      case "purchase-returns":
        return <PurchaseReturnsModule actor={actor} />;
      case "products":
        return <ProductsModule actor={actor} />;
      case "categories":
        return <CategoriesModule actor={actor} />;
      case "warehouses":
        return <WarehousesModule actor={actor} />;
      case "transfers":
        return <TransfersModule actor={actor} />;
      case "adjustments":
        return <AdjustmentsModule actor={actor} />;
      case "movements":
        return <MovementsModule actor={actor} />;
      case "customers":
        return <CustomersModule actor={actor} />;
      case "suppliers":
        return <SuppliersModule actor={actor} />;
      case "cashboxes":
        return <CashboxesModule actor={actor} />;
      case "receipts-payments":
        return <ReceiptsPaymentsModule />;
      case "expenses":
        return <ExpensesModule actor={actor} />;
      case "employees":
        return <EmployeesModule actor={actor} />;
      case "taxes":
        return <TaxesModule actor={actor} />;
      case "reports":
        return <Reports actor={actor} />;
      case "users":
        return <UsersModule />;
      case "audit":
        return <AuditLogModule />;
      case "settings":
        return <SettingsView actor={actor} />;
      default:
        return <Dashboard actor={actor} />;
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="border-b border-emerald-900/10 bg-gradient-to-l from-emerald-800 via-emerald-700 to-teal-700 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold leading-tight">{data.settings.companyName}</h1>
              <p className="text-xs text-emerald-100">نظام إدارة المبيعات والمخزون والخزينة</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={cn(
                "hidden border-white/25 sm:inline-flex",
                isApiMode() ? "bg-emerald-900/30 text-emerald-100" : "bg-white/10 text-emerald-100",
              )}
            >
              {dataSourceLabel()}
            </Badge>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium">{actor.name}</p>
              <p className="text-xs text-emerald-100">{roleLabel(actor.role)}</p>
            </div>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-44 border-white/30 bg-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} — {roleLabel(u.role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6 lg:flex-row">
        <nav className="lg:w-60 lg:shrink-0">
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:flex-col lg:overflow-visible">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="flex gap-2 lg:flex-col">
                <p className="hidden px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">
                  {group.title}
                </p>
                {group.items.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      title={t.label}
                      className={cn(
                        "flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="hidden lg:inline">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1">{renderTab()}</main>
      </div>

      <footer className="mx-auto max-w-7xl px-6 pb-8 pt-2 text-center text-xs text-slate-400">
        {isApiMode()
          ? "متصل بالخادم — البيانات محفوظة في قاعدة بيانات SQLite."
          : "وضع النموذج الأولي — البيانات محفوظة محليًا في المتصفح (localStorage). لربط الخادم اضبط VITE_API_URL."}
      </footer>
    </div>
  );
}
