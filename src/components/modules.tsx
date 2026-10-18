import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Ban,
  Printer,
  Warehouse,
  ArrowLeftRight,
  Landmark,
  Wallet,
  UserCog,
  Percent,
  ShieldCheck,
  ScrollText,
  Undo2,
  ShoppingCart,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  addExpense,
  cancelInvoice,
  cancelPurchase,
  can,
  cashBalance,
  computeTotals,
  createInvoice,
  createPurchase,
  deleteSupplier,
  expensesTotal,
  saveAccount,
  saveEmployee,
  saveTax,
} from "@/lib/store";
import type {
  Account,
  Employee,
  Invoice,
  InvoiceLine,
  Purchase,
  TaxRule,
  User,
} from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorBanner,
  FilterBar,
  PageHeader,
  SearchInput,
  SuccessBanner,
  useAppData,
  useConfirm,
  useFilteredRows,
} from "@/components/shared";

/* ============================ INVOICES ============================ */

export function SalesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [paid, setPaid] = useState(0);
  const [warehouseId, setWarehouseId] = useState(() => data.warehouses.find((w) => w.active)?.id ?? "");
  const [accountId, setAccountId] = useState(() => data.accounts.find((a) => a.active)?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [printTarget, setPrintTarget] = useState<Invoice | null>(null);
  const [query, setQuery] = useState("");
  const confirm = useConfirm();

  const totals = useMemo(() => computeTotals(lines), [lines]);
  const canCreate = can(actor.role, "create");
  const rows = useFilteredRows(data.invoices, query, (i) => [i.number, i.customerName]);

  function addLine() {
    const first = data.products.find((p) => p.active);
    if (!first) { setError("لا توجد منتجات متاحة"); return; }
    setLines([...lines, {
      productId: first.id, productName: first.name, unitId: first.unitId, unitPrice: first.salePrice,
      quantity: 1, discountPercent: 0, taxPercent: data.settings.taxPercent, returnedQty: 0,
    }]);
  }

  function updateLine(index: number, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if (patch.productId) {
        const p = data.products.find((x) => x.id === patch.productId);
        if (p) { next.productName = p.name; next.unitId = p.unitId; next.unitPrice = p.salePrice; }
      }
      return next;
    }));
  }

  function submit() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      createInvoice(actor, {
        customerId,
        warehouseId,
        date: new Date(date).toISOString(),
        lines,
        paid,
        paymentMethod: paid > 0 ? (data.accounts.find((a) => a.id === accountId)?.kind === "bank" ? "bank" : "cash") : "credit",
        accountId,
        notes: "",
      });
      setLines([]); setPaid(0); setCustomerId("");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="فواتير البيع" subtitle="إنشاء فواتير مع خصم المخزون وتحديث رصيد العميل والخزينة" breadcrumbs={["الرئيسية", "المبيعات"]} />

      {canCreate ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">فاتورة جديدة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>المخزن</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                  <SelectContent>
                    {data.warehouses.filter((w) => w.active).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>حساب التحصيل</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                  <SelectContent>
                    {data.accounts.filter((a) => a.active).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>العميل</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>
                    {data.customers.filter((c) => c.active).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1"><Label>المبلغ المدفوع</Label><Input type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} /></div>
            </div>
            <Separator />
            <div className="space-y-3">
              {lines.length === 0 ? (
                <EmptyState title="لا توجد بنود" hint="اضغط «إضافة بند» لبدء الفاتورة." />
              ) : (
                lines.map((line, i) => {
                  const product = data.products.find((p) => p.id === line.productId);
                  const overStock = product ? line.quantity > product.stock : false;
                  return (
                    <div key={i} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <Label className="text-xs">المنتج</Label>
                        <Select value={line.productId} onValueChange={(v) => updateLine(i, { productId: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {data.products.filter((p) => p.active).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} — متاح {formatNumber(p.stock)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">الكمية</Label>
                        <Input type="number" value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className={cn(overStock && "border-rose-400")} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">السعر</Label>
                        <Input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs">خصم %</Label>
                        <Input type="number" value={line.discountPercent} onChange={(e) => updateLine(i, { discountPercent: Number(e.target.value) })} />
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs">ضريبة %</Label>
                        <Input type="number" value={line.taxPercent} onChange={(e) => updateLine(i, { taxPercent: Number(e.target.value) })} />
                      </div>
                      <div className="flex items-end sm:col-span-2">
                        <Button variant="ghost" className="w-full text-rose-600 hover:text-rose-700" onClick={() => setLines((p) => p.filter((_, x) => x !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {overStock ? <p className="text-xs text-rose-600 sm:col-span-12">الكمية المطلوبة أكبر من المتاح ({formatNumber(product?.stock ?? 0)})</p> : null}
                    </div>
                  );
                })
              )}
              <Button variant="outline" onClick={addLine}><Plus className="h-4 w-4" /> إضافة بند</Button>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                <span className="text-slate-500">الإجمالي قبل الخصم</span>
                <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                <span className="text-slate-500">الخصم</span>
                <span className="font-medium text-amber-700">{formatCurrency(totals.discountTotal)}</span>
                <span className="text-slate-500">الضريبة</span>
                <span className="font-medium">{formatCurrency(totals.taxTotal)}</span>
                <span className="text-slate-500">الصافي</span>
                <span className="text-lg font-bold text-emerald-700">{formatCurrency(totals.total)}</span>
              </div>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={saving || lines.length === 0 || !customerId}>
                <ReceiptText className="h-4 w-4" /> حفظ الفاتورة
              </Button>
            </div>
            <ErrorBanner message={error} />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-6 text-sm text-slate-500">لا تملك صلاحية إنشاء الفواتير.</CardContent></Card>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">سجل الفواتير ({formatNumber(rows.length)})</CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث برقم الفاتورة أو العميل..." />
        </CardHeader>
        <CardContent>
          <DataTable
            rows={rows}
            emptyTitle="لا توجد فواتير"
            emptyHint="الفواتير التي تنشئها ستظهر هنا."
            columns={[
              { key: "num", header: "الرقم", render: (i) => <span className="font-medium">{i.number}</span> },
              { key: "cus", header: "العميل", render: (i) => i.customerName },
              { key: "date", header: "التاريخ", render: (i) => formatDate(i.date) },
              { key: "total", header: "الإجمالي", render: (i) => formatCurrency(i.total) },
              { key: "paid", header: "المدفوع", render: (i) => formatCurrency(i.paid) },
              { key: "status", header: "الحالة", render: (i) => <StatusBadge status={i.status} /> },
              {
                key: "act", header: "إجراءات",
                render: (i) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setPrintTarget(i)}><Printer className="h-4 w-4" /></Button>
                    {i.status !== "cancelled" && can(actor.role, "approve") ? (
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                        onClick={() => confirm.request(`إلغاء الفاتورة ${i.number}؟ سيتم عكس المخزون والرصيد.`, () => {
                          try { cancelInvoice(actor, i.id); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                        })}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {printTarget ? <InvoicePrint invoice={printTarget} company={data.settings.companyName} onClose={() => setPrintTarget(null)} /> : null}
      <ConfirmDialog open={!!confirm.pending} title="تأكيد الإلغاء" message={confirm.pending?.message ?? ""} confirmLabel="تأكيد"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "مدفوعة", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    partial: { label: "جزئية", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    unpaid: { label: "غير مدفوعة", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    cancelled: { label: "ملغاة", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  };
  const s = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

function InvoicePrint({ invoice, company, onClose }: { invoice: Invoice; company: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <Card className="max-h-full w-full max-w-2xl overflow-auto border-slate-200 shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100">
          <CardTitle className="text-base">فاتورة {invoice.number}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-serif text-xl font-bold text-slate-900">{company}</p>
              <p className="text-sm text-slate-500">فاتورة بيع</p>
            </div>
            <div className="text-left text-sm text-slate-600">
              <p>التاريخ: {formatDate(invoice.date)}</p>
              <p>العميل: {invoice.customerName}</p>
              <p>بواسطة: {invoice.createdBy}</p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-slate-500">
                <th className="py-2">المنتج</th><th className="py-2">الكمية</th><th className="py-2">السعر</th><th className="py-2">خصم %</th><th className="py-2">ضريبة %</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2">{l.productName}</td>
                  <td className="py-2">{formatNumber(l.quantity)}</td>
                  <td className="py-2">{formatCurrency(l.unitPrice)}</td>
                  <td className="py-2">{formatNumber(l.discountPercent)}%</td>
                  <td className="py-2">{formatNumber(l.taxPercent)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">الإجمالي</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">الخصم</span><span>{formatCurrency(invoice.discountTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">الضريبة</span><span>{formatCurrency(invoice.taxTotal)}</span></div>
            <Separator />
            <div className="flex justify-between text-base font-bold text-emerald-700"><span>الصافي</span><span>{formatCurrency(invoice.total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">المدفوع</span><span>{formatCurrency(invoice.paid)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">المتبقي</span><span>{formatCurrency(invoice.total - invoice.paid)}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* =========================== PURCHASES ============================ */

export function PurchasesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [paid, setPaid] = useState(0);
  const [warehouseId, setWarehouseId] = useState(() => data.warehouses.find((w) => w.active)?.id ?? "");
  const [accountId, setAccountId] = useState(() => data.accounts.find((a) => a.active)?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const confirm = useConfirm();

  const totals = useMemo(() => computeTotals(lines), [lines]);
  const canCreate = can(actor.role, "create");
  const rows = useFilteredRows(data.purchases, query, (p) => [p.number, p.supplierName]);

  function addLine() {
    const first = data.products.find((p) => p.active);
    if (!first) { setError("لا توجد منتجات متاحة"); return; }
    setLines([...lines, {
      productId: first.id, productName: first.name, unitId: first.unitId, unitPrice: first.costPrice,
      quantity: 1, discountPercent: 0, taxPercent: data.settings.taxPercent, returnedQty: 0,
    }]);
  }

  function updateLine(index: number, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if (patch.productId) {
        const p = data.products.find((x) => x.id === patch.productId);
        if (p) { next.productName = p.name; next.unitId = p.unitId; next.unitPrice = p.costPrice; }
      }
      return next;
    }));
  }

  function submit() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      createPurchase(actor, {
        supplierId,
        warehouseId,
        date: new Date(date).toISOString(),
        supplierRef: "",
        lines,
        paid,
        paymentMethod: paid > 0 ? (data.accounts.find((a) => a.id === accountId)?.kind === "bank" ? "bank" : "cash") : "credit",
        accountId,
        notes: "",
      });
      setLines([]); setPaid(0); setSupplierId("");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="فواتير الشراء" subtitle="شراء الأصناف مع زيادة المخزون وتحديث رصيد المورد" breadcrumbs={["الرئيسية", "المشتريات"]} />

      {canCreate ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">فاتورة شراء جديدة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>المخزن</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                  <SelectContent>
                    {data.warehouses.filter((w) => w.active).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>حساب السداد</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                  <SelectContent>
                    {data.accounts.filter((a) => a.active).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>المورد</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                  <SelectContent>
                    {data.suppliers.filter((s) => s.active).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1"><Label>المبلغ المدفوع</Label><Input type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} /></div>
            </div>
            <Separator />
            <div className="space-y-3">
              {lines.length === 0 ? (
                <EmptyState title="لا توجد بنود" hint="اضغط «إضافة بند» لبدء الفاتورة." />
              ) : (
                lines.map((line, i) => (
                  <div key={i} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <Label className="text-xs">المنتج</Label>
                      <Select value={line.productId} onValueChange={(v) => updateLine(i, { productId: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {data.products.filter((p) => p.active).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">الكمية</Label>
                      <Input type="number" value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">سعر التكلفة</Label>
                      <Input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                    </div>
                    <div className="sm:col-span-1">
                      <Label className="text-xs">خصم %</Label>
                      <Input type="number" value={line.discountPercent} onChange={(e) => updateLine(i, { discountPercent: Number(e.target.value) })} />
                    </div>
                    <div className="sm:col-span-1">
                      <Label className="text-xs">ضريبة %</Label>
                      <Input type="number" value={line.taxPercent} onChange={(e) => updateLine(i, { taxPercent: Number(e.target.value) })} />
                    </div>
                    <div className="flex items-end sm:col-span-2">
                      <Button variant="ghost" className="w-full text-rose-600 hover:text-rose-700" onClick={() => setLines((p) => p.filter((_, x) => x !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <Button variant="outline" onClick={addLine}><Plus className="h-4 w-4" /> إضافة بند</Button>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                <span className="text-slate-500">الإجمالي قبل الخصم</span>
                <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                <span className="text-slate-500">الخصم</span>
                <span className="font-medium text-amber-700">{formatCurrency(totals.discountTotal)}</span>
                <span className="text-slate-500">الضريبة</span>
                <span className="font-medium">{formatCurrency(totals.taxTotal)}</span>
                <span className="text-slate-500">الصافي</span>
                <span className="text-lg font-bold text-emerald-700">{formatCurrency(totals.total)}</span>
              </div>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={saving || lines.length === 0 || !supplierId}>
                <ShoppingCart className="h-4 w-4" /> حفظ الفاتورة
              </Button>
            </div>
            <ErrorBanner message={error} />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-6 text-sm text-slate-500">لا تملك صلاحية إنشاء فواتير الشراء.</CardContent></Card>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">سجل فواتير الشراء ({formatNumber(rows.length)})</CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث برقم الفاتورة أو المورد..." />
        </CardHeader>
        <CardContent>
          <DataTable
            rows={rows}
            emptyTitle="لا توجد فواتير شراء"
            emptyHint="الفواتير التي تنشئها ستظهر هنا."
            columns={[
              { key: "num", header: "الرقم", render: (p) => <span className="font-medium">{p.number}</span> },
              { key: "sup", header: "المورد", render: (p) => p.supplierName },
              { key: "date", header: "التاريخ", render: (p) => formatDate(p.date) },
              { key: "total", header: "الإجمالي", render: (p) => formatCurrency(p.total) },
              { key: "paid", header: "المدفوع", render: (p) => formatCurrency(p.paid) },
              { key: "status", header: "الحالة", render: (p) => <StatusBadge status={p.status} /> },
              {
                key: "act", header: "إجراءات",
                render: (p) => (
                  <div className="flex gap-1">
                    {p.status !== "cancelled" && can(actor.role, "approve") ? (
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                        onClick={() => confirm.request(`إلغاء فاتورة الشراء ${p.number}؟ سيتم عكس المخزون والرصيد.`, () => {
                          try { cancelPurchase(actor, p.id); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                        })}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <ConfirmDialog open={!!confirm.pending} title="تأكيد الإلغاء" message={confirm.pending?.message ?? ""} confirmLabel="تأكيد"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}

/* ======================= SALES RETURNS ============================ */

export function SalesReturnsModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const confirm = useConfirm();

  const rows = useFilteredRows(
    data.invoices.filter((i) => i.status !== "cancelled"),
    query,
    (i) => [i.number, i.customerName],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="مرتجعات البيع"
        subtitle="إلغاء فاتورة بيع يعكس المخزون ورصيد العميل والخزينة تلقائيًا"
        breadcrumbs={["الرئيسية", "مرتجعات البيع"]}
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Undo2 className="h-4 w-4 text-amber-600" /> الفواتير القابلة للإرجاع ({formatNumber(rows.length)})
          </CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث برقم الفاتورة أو العميل..." />
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorBanner message={error} />
          <DataTable
            rows={rows}
            emptyTitle="لا توجد فواتير قابلة للإرجاع"
            emptyHint="أنشئ فاتورة بيع أولًا من تبويب المبيعات."
            columns={[
              { key: "num", header: "الرقم", render: (i) => <span className="font-medium">{i.number}</span> },
              { key: "cus", header: "العميل", render: (i) => i.customerName },
              { key: "date", header: "التاريخ", render: (i) => formatDate(i.date) },
              { key: "total", header: "الإجمالي", render: (i) => formatCurrency(i.total) },
              {
                key: "act", header: "إجراء",
                render: (i) => (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-700"
                    disabled={!can(actor.role, "approve")}
                    onClick={() => confirm.request(`إرجاع الفاتورة ${i.number}؟ سيتم عكس المخزون والرصيد والخزينة.`, () => {
                      try { cancelInvoice(actor, i.id); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                    })}
                  >
                    <Undo2 className="h-4 w-4" /> إرجاع
                  </Button>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
      <ConfirmDialog open={!!confirm.pending} title="تأكيد الإرجاع" message={confirm.pending?.message ?? ""} confirmLabel="تأكيد"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}

/* ====================== PURCHASE RETURNS ========================== */

export function PurchaseReturnsModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const confirm = useConfirm();

  const rows = useFilteredRows(
    data.purchases.filter((p) => p.status !== "cancelled"),
    query,
    (p) => [p.number, p.supplierName],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="مرتجعات الشراء"
        subtitle="إلغاء فاتورة شراء يعكس المخزون ورصيد المورد والخزينة تلقائيًا"
        breadcrumbs={["الرئيسية", "مرتجعات الشراء"]}
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Undo2 className="h-4 w-4 text-amber-600" /> الفواتير القابلة للإرجاع ({formatNumber(rows.length)})
          </CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث برقم الفاتورة أو المورد..." />
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorBanner message={error} />
          <DataTable
            rows={rows}
            emptyTitle="لا توجد فواتير قابلة للإرجاع"
            emptyHint="أنشئ فاتورة شراء أولًا من تبويب المشتريات."
            columns={[
              { key: "num", header: "الرقم", render: (p) => <span className="font-medium">{p.number}</span> },
              { key: "sup", header: "المورد", render: (p) => p.supplierName },
              { key: "date", header: "التاريخ", render: (p) => formatDate(p.date) },
              { key: "total", header: "الإجمالي", render: (p) => formatCurrency(p.total) },
              {
                key: "act", header: "إجراء",
                render: (p) => (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-700"
                    disabled={!can(actor.role, "approve")}
                    onClick={() => confirm.request(`إرجاع فاتورة الشراء ${p.number}؟ سيتم عكس المخزون والرصيد والخزينة.`, () => {
                      try { cancelPurchase(actor, p.id); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
                    })}
                  >
                    <Undo2 className="h-4 w-4" /> إرجاع
                  </Button>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
      <ConfirmDialog open={!!confirm.pending} title="تأكيد الإرجاع" message={confirm.pending?.message ?? ""} confirmLabel="تأكيد"
        onCancel={confirm.clear} onConfirm={() => { confirm.pending?.action(); confirm.clear(); }} />
    </div>
  );
}

/* =========================== WAREHOUSES =========================== */

export function WarehousesModule() {
  const data = useAppData();

  const warehouses = useMemo(() => {
    const totalStock = data.products.reduce((s, p) => s + p.stock, 0);
    const totalValue = data.products.reduce((s, p) => s + p.costPrice * p.stock, 0);
    const lowCount = data.products.filter((p) => p.stock <= p.reorderLevel).length;
    return [
      { id: "wh-main", name: "المخزن الرئيسي", location: "القاهرة", products: data.products.length, stock: totalStock, value: totalValue, low: lowCount },
    ];
  }, [data.products]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="المخازن"
        subtitle="نظرة عامة على المخازن وكميات المخزون"
        breadcrumbs={["الرئيسية", "المخازن"]}
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Warehouse className="h-4 w-4 text-emerald-600" /> قائمة المخازن
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={warehouses}
            emptyTitle="لا توجد مخازن"
            emptyHint="لم يتم تعريف مخازن بعد."
            columns={[
              { key: "name", header: "المخزن", render: (w) => <span className="font-medium">{w.name}</span> },
              { key: "loc", header: "الموقع", render: (w) => w.location },
              { key: "prod", header: "عدد الأصناف", render: (w) => formatNumber(w.products) },
              { key: "stock", header: "إجمالي الكميات", render: (w) => formatNumber(w.stock) },
              { key: "value", header: "قيمة المخزون", render: (w) => formatCurrency(w.value) },
              { key: "low", header: "أصناف تحت الحد", render: (w) => <span className="text-amber-700">{formatNumber(w.low)}</span> },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ======================== STOCK MOVEMENTS ========================= */

export function StockMovementsModule() {
  const data = useAppData();

  const movements = useMemo(() => {
    const list: { id: string; date: string; product: string; type: string; qty: number; ref: string }[] = [];
    for (const inv of data.invoices) {
      for (const l of inv.lines) {
        list.push({
          id: `${inv.id}-${l.productId}`,
          date: inv.date,
          product: l.productName,
          type: inv.status === "cancelled" ? "إلغاء بيع" : "بيع",
          qty: inv.status === "cancelled" ? l.quantity : -l.quantity,
          ref: inv.number,
        });
      }
    }
    for (const pur of data.purchases) {
      for (const l of pur.lines) {
        list.push({
          id: `${pur.id}-${l.productId}`,
          date: pur.date,
          product: l.productName,
          type: pur.status === "cancelled" ? "إلغاء شراء" : "شراء",
          qty: pur.status === "cancelled" ? -l.quantity : l.quantity,
          ref: pur.number,
        });
      }
    }
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data.invoices, data.purchases]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="حركات المخزون"
        subtitle="سجل حركات الإدخال والإخراج الناتجة عن الفواتير"
        breadcrumbs={["الرئيسية", "حركات المخزون"]}
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-4 w-4 text-emerald-600" /> سجل الحركات ({formatNumber(movements.length)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={movements}
            emptyTitle="لا توجد حركات مخزون"
            emptyHint="ستظهر الحركات بعد إنشاء فواتير بيع أو شراء."
            columns={[
              { key: "date", header: "التاريخ", render: (m) => formatDate(m.date) },
              { key: "prod", header: "المنتج", render: (m) => m.product },
              { key: "type", header: "النوع", render: (m) => m.type },
              { key: "ref", header: "المرجع", render: (m) => <span className="font-mono text-xs">{m.ref}</span> },
              {
                key: "qty", header: "الكمية",
                render: (m) => (
                  <span className={cn("font-semibold", m.qty >= 0 ? "text-emerald-700" : "text-rose-700")}>
                    {m.qty >= 0 ? "+" : ""}{formatNumber(m.qty)}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================== CASHBOXES & BANKS ========================= */

const emptyAccount = (): Omit<Account, "id"> & { id?: string } => ({
  code: "", name: "", kind: "cashbox", openingBalance: 0, active: true,
});

export function CashboxesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [form, setForm] = useState(emptyAccount());
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const canEdit = can(actor.role, "edit") || can(actor.role, "create");
  const balance = cashBalance();

  function submit() {
    setError(""); setOk("");
    try {
      saveAccount(actor, form);
      setForm(emptyAccount());
      setOk("تم حفظ الحساب بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الخزائن والبنوك"
        subtitle="إدارة حسابات النقدية والبنوك"
        breadcrumbs={["الرئيسية", "الخزائن والبنوك"]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-emerald-600" /> الحسابات ({formatNumber(data.accounts.length)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={data.accounts}
              emptyTitle="لا توجد حسابات"
              emptyHint="أضف خزينة أو حساب بنكي."
              columns={[
                { key: "name", header: "الاسم", render: (a) => <span className="font-medium">{a.name}</span> },
                { key: "kind", header: "النوع", render: (a) => (a.kind === "cashbox" ? "خزينة" : "بنك") },
                { key: "open", header: "الرصيد الافتتاحي", render: (a) => formatCurrency(a.openingBalance) },
                { key: "act", header: "إجراء", render: (a) => <Button size="sm" variant="ghost" onClick={() => setForm({ ...a })}>تعديل</Button> },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{form.id ? "تعديل حساب" : "إضافة حساب"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800">
              رصيد الخزينة الحالي: <span className="font-bold">{formatCurrency(balance)}</span>
            </div>
            {!canEdit ? <p className="text-sm text-slate-500">لا تملك صلاحية التعديل.</p> : (
              <>
                <div className="space-y-1"><Label>الكود</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CASH-01" /></div>
                <div className="space-y-1"><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label>النوع</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Account["kind"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashbox">خزينة</SelectItem>
                      <SelectItem value="bank">بنك</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>الرصيد الافتتاحي</Label><Input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} /></div>
                <ErrorBanner message={error} />
                <SuccessBanner message={ok} />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                    <Plus className="h-4 w-4" /> {form.id ? "حفظ" : "إضافة"}
                  </Button>
                  {form.id ? <Button variant="outline" onClick={() => setForm(emptyAccount())}>إلغاء</Button> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ====================== RECEIPTS & PAYMENTS ======================= */

export function ReceiptsPaymentsModule() {
  const data = useAppData();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");

  const rows = useFilteredRows(
    data.cash.filter((c) => c.type === "receipt" || c.type === "payment" || c.type === "sale" || c.type === "purchase"),
    query,
    (c) => [c.reference, c.note],
  );
  const filtered = kind === "all" ? rows : rows.filter((c) => c.type === kind);

  return (
    <div className="space-y-6">
      <PageHeader
        title="سندات القبض والصرف"
        subtitle="حركات التحصيل والسداد المرتبطة بالفواتير"
        breadcrumbs={["الرئيسية", "سندات القبض والصرف"]}
      />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-emerald-600" /> السندات ({formatNumber(filtered.length)})
          </CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث بالمرجع أو البيان..." />
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "الكل" },
              { value: "sale", label: "تحصيل بيع" },
              { value: "purchase", label: "سداد شراء" },
              { value: "receipt", label: "سند قبض" },
              { value: "payment", label: "سند صرف" },
            ]}
          />
          <DataTable
            rows={filtered}
            emptyTitle="لا توجد سندات"
            emptyHint="ستظهر السندات بعد إنشاء فواتير أو تسجيل حركات."
            columns={[
              { key: "date", header: "التاريخ", render: (c) => formatDate(c.date) },
              { key: "ref", header: "المرجع", render: (c) => <span className="font-mono text-xs">{c.reference}</span> },
              { key: "note", header: "البيان", render: (c) => c.note },
              {
                key: "amt", header: "المبلغ",
                render: (c) => (
                  <span className={cn("font-semibold", c.amount >= 0 ? "text-emerald-700" : "text-rose-700")}>
                    {formatCurrency(c.amount)}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================ EXPENSES ============================ */

export function ExpensesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(() => data.accounts.find((a) => a.active)?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [query, setQuery] = useState("");

  const canCreate = can(actor.role, "create");
  const rows = useFilteredRows(data.expenses, query, (e) => [e.categoryName, e.description, e.number]);

  function submit() {
    setError(""); setOk("");
    try {
      addExpense(actor, {
        date: new Date().toISOString(),
        categoryId,
        accountId,
        amount,
        description: note,
        reference: "",
      });
      setCategoryId(""); setAmount(0); setNote("");
      setOk("تم تسجيل المصروف بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="المصروفات" subtitle="تسجيل ومتابعة مصروفات النشاط" breadcrumbs={["الرئيسية", "المصروفات"]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">سجل المصروفات ({formatNumber(rows.length)})</CardTitle>
            <SearchInput value={query} onChange={setQuery} placeholder="بحث في المصروفات..." />
          </CardHeader>
          <CardContent>
            <DataTable
              rows={rows}
              emptyTitle="لا توجد مصروفات"
              emptyHint="سجّل مصروفًا من النموذج المجاور."
              columns={[
                { key: "date", header: "التاريخ", render: (e) => formatDate(e.date) },
                { key: "cat", header: "البند", render: (e) => <span className="font-medium">{e.categoryName}</span> },
                { key: "note", header: "ملاحظات", render: (e) => e.description },
                { key: "amt", header: "القيمة", render: (e) => <span className="font-semibold text-rose-700">{formatCurrency(e.amount)}</span> },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">تسجيل مصروف</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-sm text-rose-800">
              إجمالي المصروفات: <span className="font-bold">{formatCurrency(expensesTotal())}</span>
            </div>
            {!canCreate ? <p className="text-sm text-slate-500">لا تملك صلاحية التسجيل.</p> : (
              <>
                <div className="space-y-1">
                  <Label>بند المصروف</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="اختر البند" /></SelectTrigger>
                    <SelectContent>
                      {data.expenseCategories.filter((c) => c.active).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>حساب الدفع</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                    <SelectContent>
                      {data.accounts.filter((a) => a.active).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>القيمة</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>الوصف</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <ErrorBanner message={error} />
                <SuccessBanner message={ok} />
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                  <Plus className="h-4 w-4" /> تسجيل المصروف
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* =========================== EMPLOYEES ============================ */

const emptyEmployee = (): Omit<Employee, "id"> & { id?: string } => ({
  name: "", position: "", phone: "", salary: 0, active: true,
});

export function EmployeesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [form, setForm] = useState(emptyEmployee());
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [query, setQuery] = useState("");

  const canEdit = can(actor.role, "edit") || can(actor.role, "create");
  const rows = useFilteredRows(data.employees, query, (e) => [e.name, e.position, e.phone]);
  const totalSalaries = data.employees.reduce((s, e) => s + e.salary, 0);

  function submit() {
    setError(""); setOk("");
    try {
      saveEmployee(actor, form);
      setForm(emptyEmployee());
      setOk("تم حفظ الموظف بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الموظفون والرواتب" subtitle="بيانات الموظفين وإجمالي الرواتب" breadcrumbs={["الرئيسية", "الموظفون"]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">قائمة الموظفين ({formatNumber(rows.length)})</CardTitle>
            <SearchInput value={query} onChange={setQuery} placeholder="بحث بالاسم أو الوظيفة..." />
          </CardHeader>
          <CardContent>
            <DataTable
              rows={rows}
              emptyTitle="لا يوجد موظفون"
              emptyHint="أضف موظفًا جديدًا من النموذج المجاور."
              columns={[
                { key: "name", header: "الاسم", render: (e) => <span className="font-medium">{e.name}</span> },
                { key: "pos", header: "الوظيفة", render: (e) => e.position },
                { key: "phone", header: "الهاتف", render: (e) => <span dir="ltr">{e.phone}</span> },
                { key: "salary", header: "الراتب", render: (e) => formatCurrency(e.salary) },
                {
                  key: "act", header: "إجراء",
                  render: (e) => <Button size="sm" variant="ghost" onClick={() => setForm({ ...e })}>تعديل</Button>,
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{form.id ? "تعديل موظف" : "إضافة موظف"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800">
              إجمالي الرواتب: <span className="font-bold">{formatCurrency(totalSalaries)}</span>
            </div>
            {!canEdit ? <p className="text-sm text-slate-500">لا تملك صلاحية التعديل.</p> : (
              <>
                <div className="space-y-1"><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>الوظيفة</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
                <div className="space-y-1"><Label>الهاتف</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>الراتب</Label><Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} /></div>
                <ErrorBanner message={error} />
                <SuccessBanner message={ok} />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                    <Plus className="h-4 w-4" /> {form.id ? "حفظ" : "إضافة"}
                  </Button>
                  {form.id ? <Button variant="outline" onClick={() => setForm(emptyEmployee())}>إلغاء</Button> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================= TAXES ============================== */

const emptyTax = (): Omit<TaxRule, "id"> & { id?: string } => ({
  name: "", percent: 0, appliesTo: "both", active: true,
});

export function TaxesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [form, setForm] = useState(emptyTax());
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const canEdit = can(actor.role, "edit") || can(actor.role, "create");

  function submit() {
    setError(""); setOk("");
    try {
      saveTax(actor, form);
      setForm(emptyTax());
      setOk("تم حفظ الضريبة بنجاح");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الضرائب" subtitle="قواعد الضرائب المطبقة على الفواتير" breadcrumbs={["الرئيسية", "الضرائب"]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="h-4 w-4 text-emerald-600" /> قواعد الضرائب ({formatNumber(data.taxes.length)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={data.taxes}
              emptyTitle="لا توجد ضرائب"
              emptyHint="أضف قاعدة ضريبية."
              columns={[
                { key: "name", header: "الاسم", render: (t) => <span className="font-medium">{t.name}</span> },
                { key: "pct", header: "النسبة", render: (t) => `${formatNumber(t.percent)}%` },
                { key: "app", header: "تطبق على", render: (t) => (t.appliesTo === "sales" ? "المبيعات" : t.appliesTo === "purchases" ? "المشتريات" : "الاثنين") },
                {
                  key: "act", header: "إجراء",
                  render: (t) => <Button size="sm" variant="ghost" onClick={() => setForm({ ...t })}>تعديل</Button>,
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{form.id ? "تعديل ضريبة" : "إضافة ضريبة"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!canEdit ? <p className="text-sm text-slate-500">لا تملك صلاحية التعديل.</p> : (
              <>
                <div className="space-y-1"><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>النسبة %</Label><Input type="number" value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} /></div>
                <div className="space-y-1">
                  <Label>تطبق على</Label>
                  <Select value={form.appliesTo} onValueChange={(v) => setForm({ ...form, appliesTo: v as TaxRule["appliesTo"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">المبيعات</SelectItem>
                      <SelectItem value="purchases">المشتريات</SelectItem>
                      <SelectItem value="both">الاثنين</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ErrorBanner message={error} />
                <SuccessBanner message={ok} />
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submit}>
                    <Plus className="h-4 w-4" /> {form.id ? "حفظ" : "إضافة"}
                  </Button>
                  {form.id ? <Button variant="outline" onClick={() => setForm(emptyTax())}>إلغاء</Button> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================= USERS ============================== */

export function UsersModule() {
  const data = useAppData();
  return (
    <div className="space-y-6">
      <PageHeader title="المستخدمون والصلاحيات" subtitle="أدوار المستخدمين وصلاحياتهم" breadcrumbs={["الرئيسية", "المستخدمون"]} />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-emerald-600" /> المستخدمون ({formatNumber(data.users.length)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={data.users}
            emptyTitle="لا يوجد مستخدمون"
            emptyHint="لم يتم تعريف مستخدمين."
            columns={[
              { key: "name", header: "الاسم", render: (u) => <span className="font-medium">{u.name}</span> },
              { key: "user", header: "اسم الدخول", render: (u) => <span dir="ltr">{u.username}</span> },
              {
                key: "role", header: "الدور",
                render: (u) => (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {u.role === "admin" ? "مدير النظام" : u.role === "manager" ? "مدير" : u.role === "cashier" ? "كاشير" : "مشاهد"}
                  </Badge>
                ),
              },
              {
                key: "st", header: "الحالة",
                render: (u) => <Badge variant="outline" className={u.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>{u.active ? "نشط" : "معطّل"}</Badge>,
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> مصفوفة الصلاحيات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-slate-500">
                  <th className="py-2">الدور</th>
                  <th className="py-2">عرض</th>
                  <th className="py-2">إنشاء</th>
                  <th className="py-2">تعديل</th>
                  <th className="py-2">حذف</th>
                  <th className="py-2">اعتماد</th>
                  <th className="py-2">طباعة</th>
                  <th className="py-2">تصدير</th>
                </tr>
              </thead>
              <tbody>
                {(["admin", "manager", "cashier", "viewer"] as const).map((role) => (
                  <tr key={role} className="border-b border-slate-100">
                    <td className="py-2 font-medium">
                      {role === "admin" ? "مدير النظام" : role === "manager" ? "مدير" : role === "cashier" ? "كاشير" : "مشاهد"}
                    </td>
                    {(["view", "create", "edit", "delete", "approve", "print", "export"] as const).map((p) => (
                      <td key={p} className="py-2">
                        {can(role, p) ? <span className="text-emerald-600">✔</span> : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* =========================== AUDIT LOG ============================ */

export function AuditLogModule() {
  const data = useAppData();
  const [query, setQuery] = useState("");
  const rows = useFilteredRows(data.audit, query, (a) => [a.user, a.action, a.detail]);

  return (
    <div className="space-y-6">
      <PageHeader title="سجل التدقيق" subtitle="تتبع العمليات التي تمت على النظام" breadcrumbs={["الرئيسية", "سجل التدقيق"]} />
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-emerald-600" /> السجل ({formatNumber(rows.length)})
          </CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث في السجل..." />
        </CardHeader>
        <CardContent>
          <DataTable
            rows={rows}
            emptyTitle="لا توجد حركات مسجلة"
            emptyHint="ستظهر العمليات هنا بعد تنفيذها."
            columns={[
              { key: "date", header: "التاريخ", render: (a) => formatDate(a.date) },
              { key: "user", header: "المستخدم", render: (a) => a.user },
              { key: "action", header: "العملية", render: (a) => <span className="font-medium">{a.action}</span> },
              { key: "detail", header: "التفاصيل", render: (a) => a.detail },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}