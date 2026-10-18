import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Eye,
  ArrowRight,
  Barcode,
  Power,
  PowerOff,
  Tags,
  Ruler,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  can,
  categoryName,
  customerInvoices,
  deleteCategory,
  deleteCustomer,
  deleteProduct,
  deleteSupplier,
  deleteUnit,
  productMovements,
  saveCategory,
  saveCustomer,
  saveProduct,
  saveSupplier,
  saveUnit,
  supplierPurchases,
  toggleCustomerActive,
  toggleSupplierActive,
  unitName,
} from "@/lib/store";
import type {
  Category,
  Customer,
  Product,
  Supplier,
  Unit,
  User,
} from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import {
  ConfirmDialog,
  DataTable,
  ErrorBanner,
  FilterBar,
  PageHeader,
  SearchInput,
  SuccessBanner,
  useAppData,
  useConfirm,
  useFilteredRows,
} from "@/components/shared";

const PAGE_SIZE = 8;

/* --------------------------- pagination --------------------------- */

function usePagination<T>(rows: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, totalPages, slice, setPage };
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <span className="text-xs text-slate-500">صفحة {formatNumber(page)} من {formatNumber(totalPages)}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>التالي</Button>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("flex items-center gap-1 hover:text-emerald-700", active && "text-emerald-700 font-semibold")}
    >
      {label}
      <span className="text-xs">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}

/* ============================ CUSTOMERS =========================== */

const emptyCustomer = (): Omit<Customer, "id" | "code"> & { id?: string } => ({
  name: "", phone: "", email: "", address: "", notes: "", openingBalance: 0, balance: 0, active: true,
});

/** Human-readable payment state for a sales/purchase document. */
function invoicePaymentLabel(d: { status: string; total: number; paid: number }): string {
  if (d.status === "cancelled") return "ملغاة";
  if (d.status === "draft") return "مسودة";
  if (d.paid >= d.total) return "مدفوعة";
  if (d.paid > 0) return "جزئية";
  return "غير مدفوعة";
}

export function CustomersModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<"name" | "balance">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [form, setForm] = useState(emptyCustomer());
  const [detail, setDetail] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const confirm = useConfirm();

  const canEdit = can(actor.role, "edit") || can(actor.role, "create");

  const searched = useFilteredRows(data.customers, query, (c) => [c.name, c.phone, c.code, c.email]);
  const filtered = status === "all" ? searched : searched.filter((c) => (status === "active" ? c.active : !c.active));
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name, "ar") : a.balance - b.balance;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pager = usePagination(sorted);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function submit() {
    setError(""); setOk("");
    try {
      saveCustomer(actor, form);
      setForm(emptyCustomer());
      setOk("تم حفظ بيانات العميل بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  if (detail) {
    const invoices = customerInvoices(detail.id);
    const totalSales = invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.total, 0);
    const totalReturns = invoices.filter((i) => i.status === "cancelled").reduce((s, i) => s + i.total, 0);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
            <ArrowRight className="h-4 w-4" /> رجوع
          </Button>
          <PageHeader title={detail.name} subtitle={`كود العميل: ${detail.code}`} breadcrumbs={["الرئيسية", "العملاء", detail.name]} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">الرصيد المستحق</p><p className="mt-1 text-2xl font-bold text-amber-700">{formatCurrency(detail.balance)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">إجمالي المبيعات</p><p className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(totalSales)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">إجمالي المرتجعات</p><p className="mt-1 text-2xl font-bold text-rose-700">{formatCurrency(totalReturns)}</p></CardContent></Card>
        </div>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">بيانات الاتصال</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">الهاتف: </span><span dir="ltr">{detail.phone}</span></div>
            <div><span className="text-slate-500">البريد: </span><span dir="ltr">{detail.email || "—"}</span></div>
            <div className="sm:col-span-2"><span className="text-slate-500">العنوان: </span>{detail.address || "—"}</div>
            <div className="sm:col-span-2"><span className="text-slate-500">ملاحظات: </span>{detail.notes || "—"}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">سجل الفواتير والمرتجعات ({formatNumber(invoices.length)})</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              rows={invoices}
              emptyTitle="لا توجد حركات"
              emptyHint="لم يتم إنشاء فواتير لهذا العميل بعد."
              columns={[
                { key: "num", header: "الرقم", render: (i) => <span className="font-medium">{i.number}</span> },
                { key: "date", header: "التاريخ", render: (i) => formatDate(i.date) },
                { key: "total", header: "الإجمالي", render: (i) => formatCurrency(i.total) },
                { key: "paid", header: "المدفوع", render: (i) => formatCurrency(i.paid) },
                {
                  key: "status", header: "الحالة",
                  render: (i) => (
                    <Badge variant="outline" className={i.status === "cancelled" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                      {invoicePaymentLabel(i)}
                    </Badge>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="العملاء" subtitle="إدارة بيانات العملاء والأرصدة المستحقة" breadcrumbs={["الرئيسية", "العملاء"]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">قائمة العملاء ({formatNumber(sorted.length)})</CardTitle>
            <SearchInput value={query} onChange={setQuery} placeholder="بحث بالاسم أو الكود أو الهاتف..." />
          </CardHeader>
          <CardContent className="space-y-4">
            <FilterBar
              label="الحالة"
              value={status}
              onChange={setStatus}
              options={[{ value: "all", label: "الكل" }, { value: "active", label: "نشط" }, { value: "inactive", label: "معطّل" }]}
            />
            <DataTable
              rows={pager.slice}
              emptyTitle="لا يوجد عملاء"
              emptyHint="أضف عميلًا جديدًا من النموذج المجاور."
              columns={[
                {
                  key: "name", header: "العميل",
                  render: (c) => (
                    <div>
                      <button className="font-medium text-slate-800 hover:text-emerald-700" onClick={() => setDetail(c)}>{c.name}</button>
                      <p className="font-mono text-xs text-slate-400">{c.code}</p>
                    </div>
                  ),
                },
                { key: "phone", header: "الهاتف", render: (c) => <span dir="ltr">{c.phone}</span> },
                {
                  key: "bal", header: "الرصيد",
                  render: (c) => <span className={cn(c.balance > 0 ? "font-semibold text-amber-700" : "text-slate-600")}>{formatCurrency(c.balance)}</span>,
                },
                {
                  key: "st", header: "الحالة",
                  render: (c) => <Badge variant="outline" className={c.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>{c.active ? "نشط" : "معطّل"}</Badge>,
                },
                {
                  key: "act", header: "إجراءات",
                  render: (c) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(c)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setForm({ ...c })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title={c.active ? "تعطيل" : "تنشيط"}
                        onClick={() => { try { toggleCustomerActive(actor, c.id); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); } }}>
                        {c.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                        onClick={() => confirm.request(`حذف العميل «${c.name}»؟`, () => {
                          try { deleteCustomer(actor, c.id); setOk("تم حذف العميل"); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                        })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              <SortHeader label="الاسم" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
              <SortHeader label="الرصيد" active={sortKey === "balance"} dir={sortDir} onClick={() => toggleSort("balance")} />
            </div>
            <Pagination page={pager.page} totalPages={pager.totalPages} onPage={pager.setPage} />
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{form.id ? "تعديل عميل" : "إضافة عميل جديد"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!canEdit ? <p className="text-sm text-slate-500">لا تملك صلاحية التعديل.</p> : (
              <>
                <div className="space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>الهاتف *</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>البريد الإلكتروني</Label><Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1"><Label>العنوان</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="space-y-1"><Label>ملاحظات</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label>الرصيد الافتتاحي</Label>
                  <Input type="number" value={form.openingBalance} disabled={!!form.id} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
                  {form.id ? <p className="text-xs text-slate-400">لا يمكن تعديل الرصيد الافتتاحي بعد الإنشاء.</p> : null}
                </div>
                <ErrorBanner message={error} />
                <SuccessBanner message={ok} />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                    <Plus className="h-4 w-4" /> {form.id ? "حفظ التعديل" : "إضافة"}
                  </Button>
                  {form.id ? <Button variant="outline" onClick={() => setForm(emptyCustomer())}>إلغاء</Button> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog open={!!confirm.pending} title="تأكيد الحذف" message={confirm.pending?.message ?? ""} confirmLabel="حذف"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}

/* =========================== SUPPLIERS ============================ */

const emptySupplier = (): Omit<Supplier, "id" | "code"> & { id?: string } => ({
  name: "", phone: "", email: "", address: "", notes: "", openingBalance: 0, balance: 0, active: true,
});

export function SuppliersModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState(emptySupplier());
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const confirm = useConfirm();

  const canEdit = can(actor.role, "edit") || can(actor.role, "create");

  const searched = useFilteredRows(data.suppliers, query, (s) => [s.name, s.phone, s.code, s.email]);
  const filtered = status === "all" ? searched : searched.filter((s) => (status === "active" ? s.active : !s.active));
  const pager = usePagination(filtered);

  function submit() {
    setError(""); setOk("");
    try {
      saveSupplier(actor, form);
      setForm(emptySupplier());
      setOk("تم حفظ بيانات المورد بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  if (detail) {
    const purchases = supplierPurchases(detail.id);
    const totalPurchases = purchases.filter((p) => p.status !== "cancelled").reduce((s, p) => s + p.total, 0);
    const totalPaid = purchases.reduce((s, p) => s + p.paid, 0);
    const totalReturns = purchases.filter((p) => p.status === "cancelled").reduce((s, p) => s + p.total, 0);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
            <ArrowRight className="h-4 w-4" /> رجوع
          </Button>
          <PageHeader title={detail.name} subtitle={`كود المورد: ${detail.code}`} breadcrumbs={["الرئيسية", "الموردون", detail.name]} />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">المستحق له</p><p className="mt-1 text-2xl font-bold text-rose-700">{formatCurrency(detail.balance)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">إجمالي المشتريات</p><p className="mt-1 text-2xl font-bold text-slate-800">{formatCurrency(totalPurchases)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">إجمالي المدفوع</p><p className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(totalPaid)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">إجمالي المرتجعات</p><p className="mt-1 text-2xl font-bold text-amber-700">{formatCurrency(totalReturns)}</p></CardContent></Card>
        </div>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">بيانات الاتصال</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">الهاتف: </span><span dir="ltr">{detail.phone}</span></div>
            <div><span className="text-slate-500">البريد: </span><span dir="ltr">{detail.email || "—"}</span></div>
            <div className="sm:col-span-2"><span className="text-slate-500">العنوان: </span>{detail.address || "—"}</div>
            <div className="sm:col-span-2"><span className="text-slate-500">ملاحظات: </span>{detail.notes || "—"}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">سجل فواتير الشراء والمرتجعات ({formatNumber(purchases.length)})</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              rows={purchases}
              emptyTitle="لا توجد حركات"
              emptyHint="لم يتم إنشاء فواتير شراء لهذا المورد بعد."
              columns={[
                { key: "num", header: "الرقم", render: (p) => <span className="font-medium">{p.number}</span> },
                { key: "date", header: "التاريخ", render: (p) => formatDate(p.date) },
                { key: "total", header: "الإجمالي", render: (p) => formatCurrency(p.total) },
                { key: "paid", header: "المدفوع", render: (p) => formatCurrency(p.paid) },
                {
                  key: "status", header: "الحالة",
                  render: (p) => (
                    <Badge variant="outline" className={p.status === "cancelled" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                      {invoicePaymentLabel(p)}
                    </Badge>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الموردون" subtitle="إدارة بيانات الموردين والأرصدة المستحقة لهم" breadcrumbs={["الرئيسية", "الموردون"]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">قائمة الموردين ({formatNumber(filtered.length)})</CardTitle>
            <SearchInput value={query} onChange={setQuery} placeholder="بحث بالاسم أو الكود أو الهاتف..." />
          </CardHeader>
          <CardContent className="space-y-4">
            <FilterBar
              label="الحالة"
              value={status}
              onChange={setStatus}
              options={[{ value: "all", label: "الكل" }, { value: "active", label: "نشط" }, { value: "inactive", label: "معطّل" }]}
            />
            <DataTable
              rows={pager.slice}
              emptyTitle="لا يوجد موردون"
              emptyHint="أضف موردًا جديدًا من النموذج المجاور."
              columns={[
                {
                  key: "name", header: "المورد",
                  render: (s) => (
                    <div>
                      <button className="font-medium text-slate-800 hover:text-emerald-700" onClick={() => setDetail(s)}>{s.name}</button>
                      <p className="font-mono text-xs text-slate-400">{s.code}</p>
                    </div>
                  ),
                },
                { key: "phone", header: "الهاتف", render: (s) => <span dir="ltr">{s.phone}</span> },
                {
                  key: "bal", header: "المستحق له",
                  render: (s) => <span className={cn(s.balance > 0 ? "font-semibold text-rose-700" : "text-slate-600")}>{formatCurrency(s.balance)}</span>,
                },
                {
                  key: "st", header: "الحالة",
                  render: (s) => <Badge variant="outline" className={s.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>{s.active ? "نشط" : "معطّل"}</Badge>,
                },
                {
                  key: "act", header: "إجراءات",
                  render: (s) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(s)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setForm({ ...s })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title={s.active ? "تعطيل" : "تنشيط"}
                        onClick={() => { try { toggleSupplierActive(actor, s.id); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); } }}>
                        {s.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                        onClick={() => confirm.request(`حذف المورد «${s.name}»؟`, () => {
                          try { deleteSupplier(actor, s.id); setOk("تم حذف المورد"); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                        })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={pager.page} totalPages={pager.totalPages} onPage={pager.setPage} />
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{form.id ? "تعديل مورد" : "إضافة مورد جديد"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!canEdit ? <p className="text-sm text-slate-500">لا تملك صلاحية التعديل.</p> : (
              <>
                <div className="space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>الهاتف *</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>البريد الإلكتروني</Label><Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1"><Label>العنوان</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="space-y-1"><Label>ملاحظات</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label>الرصيد الافتتاحي</Label>
                  <Input type="number" value={form.openingBalance} disabled={!!form.id} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
                  {form.id ? <p className="text-xs text-slate-400">لا يمكن تعديل الرصيد الافتتاحي بعد الإنشاء.</p> : null}
                </div>
                <ErrorBanner message={error} />
                <SuccessBanner message={ok} />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                    <Plus className="h-4 w-4" /> {form.id ? "حفظ التعديل" : "إضافة"}
                  </Button>
                  {form.id ? <Button variant="outline" onClick={() => setForm(emptySupplier())}>إلغاء</Button> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog open={!!confirm.pending} title="تأكيد الحذف" message={confirm.pending?.message ?? ""} confirmLabel="حذف"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}

/* ============================ PRODUCTS ============================ */

const emptyProduct = (): Omit<Product, "id"> & { id?: string } => ({
  sku: "", barcode: "", name: "", description: "", categoryId: "", unitId: "",
  costPrice: 0, salePrice: 0, stock: 0, reorderLevel: 10, active: true,
});

export function ProductsModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<"name" | "salePrice" | "stock">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [form, setForm] = useState(emptyProduct());
  const [detail, setDetail] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const confirm = useConfirm();

  const canEdit = can(actor.role, "edit") || can(actor.role, "create");

  const searched = useFilteredRows(data.products, query, (p) => [p.name, p.sku, p.barcode, categoryName(p.categoryId)]);
  const byCat = category === "all" ? searched : searched.filter((p) => p.categoryId === category);
  const byStatus = status === "all" ? byCat : byCat.filter((p) => (status === "active" ? p.active : !p.active));
  const sorted = useMemo(() => {
    const arr = [...byStatus];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name, "ar");
      else if (sortKey === "salePrice") cmp = a.salePrice - b.salePrice;
      else cmp = a.stock - b.stock;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [byStatus, sortKey, sortDir]);

  const pager = usePagination(sorted);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function submit() {
    setError(""); setOk("");
    try {
      saveProduct(actor, form);
      setForm(emptyProduct());
      setOk("تم حفظ المنتج بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  if (detail) {
    const movements = productMovements(detail.id);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
            <ArrowRight className="h-4 w-4" /> رجوع
          </Button>
          <PageHeader title={detail.name} subtitle={`كود المنتج: ${detail.sku}`} breadcrumbs={["الرئيسية", "المنتجات", detail.name]} />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">الكمية المتاحة</p><p className={cn("mt-1 text-2xl font-bold", detail.stock <= detail.reorderLevel ? "text-amber-700" : "text-emerald-700")}>{formatNumber(detail.stock)} {unitName(detail.unitId)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">سعر التكلفة</p><p className="mt-1 text-2xl font-bold text-slate-800">{formatCurrency(detail.costPrice)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">سعر البيع</p><p className="mt-1 text-2xl font-bold text-slate-800">{formatCurrency(detail.salePrice)}</p></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs text-slate-500">قيمة المخزون</p><p className="mt-1 text-2xl font-bold text-slate-800">{formatCurrency(detail.costPrice * detail.stock)}</p></CardContent></Card>
        </div>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">بيانات المنتج</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">التصنيف: </span>{categoryName(detail.categoryId)}</div>
            <div><span className="text-slate-500">الوحدة: </span>{unitName(detail.unitId)}</div>
            <div><span className="text-slate-500">الباركود: </span><span className="font-mono" dir="ltr">{detail.barcode || "—"}</span></div>
            <div><span className="text-slate-500">حد إعادة الطلب: </span>{formatNumber(detail.reorderLevel)}</div>
            <div className="sm:col-span-2"><span className="text-slate-500">الوصف: </span>{detail.description || "—"}</div>
          </CardContent>
        </Card>
        {detail.barcode ? (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Barcode className="h-4 w-4 text-emerald-600" /> ملصق الباركود</CardTitle></CardHeader>
            <CardContent>
              <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-6 py-4">
                <span className="text-xs text-slate-500">{detail.name}</span>
                <div className="flex h-12 items-end gap-px">
                  {detail.barcode.split("").map((ch, i) => (
                    <span key={i} className="inline-block bg-slate-900" style={{ width: (Number(ch) % 3) + 1, height: 40 }} />
                  ))}
                </div>
                <span className="font-mono text-xs tracking-widest" dir="ltr">{detail.barcode}</span>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => window.print()}>طباعة الملصق</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">حركات المخزون ({formatNumber(movements.length)})</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              rows={movements}
              emptyTitle="لا توجد حركات"
              emptyHint="لم يتم تسجيل حركات مخزون لهذا المنتج بعد."
              columns={[
                { key: "date", header: "التاريخ", render: (m) => formatDate(m.date) },
                { key: "type", header: "النوع", render: (m) => m.type },
                { key: "ref", header: "المرجع", render: (m) => <span className="font-mono text-xs">{m.reference}</span> },
                {
                  key: "qty", header: "الكمية",
                  render: (m) => <span className={cn("font-semibold", m.qty >= 0 ? "text-emerald-700" : "text-rose-700")}>{m.qty >= 0 ? "+" : ""}{formatNumber(m.qty)}</span>,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="المنتجات والمخزون" subtitle="إدارة الأصناف والأسعار والكميات المتاحة" breadcrumbs={["الرئيسية", "المنتجات"]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">قائمة المنتجات ({formatNumber(sorted.length)})</CardTitle>
            <SearchInput value={query} onChange={setQuery} placeholder="بحث بالاسم أو الكود أو الباركود..." />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <FilterBar
                label="التصنيف"
                value={category}
                onChange={setCategory}
                options={[{ value: "all", label: "الكل" }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))]}
              />
              <FilterBar
                label="الحالة"
                value={status}
                onChange={setStatus}
                options={[{ value: "all", label: "الكل" }, { value: "active", label: "نشط" }, { value: "inactive", label: "معطّل" }]}
              />
            </div>
            <DataTable
              rows={pager.slice}
              emptyTitle="لا توجد منتجات"
              emptyHint="أضف منتجًا جديدًا من النموذج المجاور."
              columns={[
                {
                  key: "name", header: "المنتج",
                  render: (p) => (
                    <div>
                      <button className="font-medium text-slate-800 hover:text-emerald-700" onClick={() => setDetail(p)}>{p.name}</button>
                      <p className="font-mono text-xs text-slate-400">{p.sku}</p>
                    </div>
                  ),
                },
                { key: "cat", header: "التصنيف", render: (p) => categoryName(p.categoryId) },
                { key: "cost", header: "التكلفة", render: (p) => formatCurrency(p.costPrice) },
                { key: "sale", header: "البيع", render: (p) => formatCurrency(p.salePrice) },
                {
                  key: "stock", header: "المخزون",
                  render: (p) => (
                    <span className={cn(p.stock <= p.reorderLevel ? "font-semibold text-amber-700" : "text-slate-700")}>
                      {formatNumber(p.stock)} {unitName(p.unitId)}
                    </span>
                  ),
                },
                {
                  key: "st", header: "الحالة",
                  render: (p) => <Badge variant="outline" className={p.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>{p.active ? "نشط" : "معطّل"}</Badge>,
                },
                {
                  key: "act", header: "إجراءات",
                  render: (p) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(p)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setForm({ ...p })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                        onClick={() => confirm.request(`حذف المنتج «${p.name}»؟`, () => {
                          try { deleteProduct(actor, p.id); setOk("تم حذف المنتج"); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                        })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              <SortHeader label="الاسم" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
              <SortHeader label="سعر البيع" active={sortKey === "salePrice"} dir={sortDir} onClick={() => toggleSort("salePrice")} />
              <SortHeader label="المخزون" active={sortKey === "stock"} dir={sortDir} onClick={() => toggleSort("stock")} />
            </div>
            <Pagination page={pager.page} totalPages={pager.totalPages} onPage={pager.setPage} />
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{form.id ? "تعديل منتج" : "إضافة منتج جديد"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!canEdit ? <p className="text-sm text-slate-500">لا تملك صلاحية التعديل.</p> : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>الكود (SKU) *</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                  <div className="space-y-1"><Label>الباركود</Label><Input dir="ltr" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>اسم المنتج *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>الوصف</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>التصنيف *</Label>
                    <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                      <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        {data.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>الوحدة *</Label>
                    <Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}>
                      <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        {data.units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>سعر التكلفة</Label><Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label>سعر البيع *</Label><Input type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>الكمية</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label>حد إعادة الطلب</Label><Input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <input id="prod-active" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                  <Label htmlFor="prod-active">منتج نشط</Label>
                </div>
                <ErrorBanner message={error} />
                <SuccessBanner message={ok} />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                    <Plus className="h-4 w-4" /> {form.id ? "حفظ التعديل" : "إضافة"}
                  </Button>
                  {form.id ? <Button variant="outline" onClick={() => setForm(emptyProduct())}>إلغاء</Button> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog open={!!confirm.pending} title="تأكيد الحذف" message={confirm.pending?.message ?? ""} confirmLabel="حذف"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}

/* ====================== CATEGORIES & UNITS ======================== */

const emptyCategory = (): Omit<Category, "id"> & { id?: string } => ({ code: "", name: "", active: true });
const emptyUnit = (): Omit<Unit, "id"> & { id?: string } => ({ code: "", name: "", active: true });

export function CategoriesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [catForm, setCatForm] = useState(emptyCategory());
  const [unitForm, setUnitForm] = useState(emptyUnit());
  const [catQuery, setCatQuery] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const confirm = useConfirm();

  const canEdit = can(actor.role, "edit") || can(actor.role, "create");

  const cats = useFilteredRows(data.categories, catQuery, (c) => [c.name, c.code]);
  const units = useFilteredRows(data.units, unitQuery, (u) => [u.name, u.code]);

  function productCountByCategory(id: string) {
    return data.products.filter((p) => p.categoryId === id).length;
  }
  function productCountByUnit(id: string) {
    return data.products.filter((p) => p.unitId === id).length;
  }

  function submitCategory() {
    setError(""); setOk("");
    try {
      saveCategory(actor, catForm);
      setCatForm(emptyCategory());
      setOk("تم حفظ التصنيف بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  function submitUnit() {
    setError(""); setOk("");
    try {
      saveUnit(actor, unitForm);
      setUnitForm(emptyUnit());
      setOk("تم حفظ الوحدة بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="التصنيفات والوحدات" subtitle="إدارة تصنيفات المنتجات ووحدات القياس" breadcrumbs={["الرئيسية", "التصنيفات والوحدات"]} />

      <ErrorBanner message={error} />
      <SuccessBanner message={ok} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4 text-emerald-600" /> التصنيفات ({formatNumber(cats.length)})
            </CardTitle>
            <SearchInput value={catQuery} onChange={setCatQuery} placeholder="بحث..." />
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable
              rows={cats}
              emptyTitle="لا توجد تصنيفات"
              emptyHint="أضف تصنيفًا جديدًا من النموذج بالأسفل."
              columns={[
                { key: "code", header: "الكود", render: (c) => <span className="font-mono text-xs">{c.code}</span> },
                { key: "name", header: "الاسم", render: (c) => <span className="font-medium">{c.name}</span> },
                { key: "count", header: "منتجات", render: (c) => formatNumber(productCountByCategory(c.id)) },
                {
                  key: "act", header: "إجراءات",
                  render: (c) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setCatForm({ ...c })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                        onClick={() => confirm.request(`حذف التصنيف «${c.name}»؟`, () => {
                          try { deleteCategory(actor, c.id); setOk("تم حذف التصنيف"); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                        })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            {canEdit ? (
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <Input placeholder="الكود" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} />
                <Input placeholder="اسم التصنيف" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                <div className="flex gap-1">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submitCategory}>
                    <Plus className="h-4 w-4" /> {catForm.id ? "حفظ" : "إضافة"}
                  </Button>
                  {catForm.id ? <Button variant="outline" onClick={() => setCatForm(emptyCategory())}>إلغاء</Button> : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4 text-emerald-600" /> الوحدات ({formatNumber(units.length)})
            </CardTitle>
            <SearchInput value={unitQuery} onChange={setUnitQuery} placeholder="بحث..." />
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable
              rows={units}
              emptyTitle="لا توجد وحدات"
              emptyHint="أضف وحدة جديدة من النموذج بالأسفل."
              columns={[
                { key: "code", header: "الكود", render: (u) => <span className="font-mono text-xs">{u.code}</span> },
                { key: "name", header: "الاسم", render: (u) => <span className="font-medium">{u.name}</span> },
                { key: "count", header: "منتجات", render: (u) => formatNumber(productCountByUnit(u.id)) },
                {
                  key: "act", header: "إجراءات",
                  render: (u) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setUnitForm({ ...u })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                        onClick={() => confirm.request(`حذف الوحدة «${u.name}»؟`, () => {
                          try { deleteUnit(actor, u.id); setOk("تم حذف الوحدة"); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                        })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            {canEdit ? (
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <Input placeholder="الكود" value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })} />
                <Input placeholder="اسم الوحدة" value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} />
                <div className="flex gap-1">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submitUnit}>
                    <Plus className="h-4 w-4" /> {unitForm.id ? "حفظ" : "إضافة"}
                  </Button>
                  {unitForm.id ? <Button variant="outline" onClick={() => setUnitForm(emptyUnit())}>إلغاء</Button> : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog open={!!confirm.pending} title="تأكيد الحذف" message={confirm.pending?.message ?? ""} confirmLabel="حذف"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}