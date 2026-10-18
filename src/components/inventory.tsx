import { useMemo, useState } from "react";
import {
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  SlidersHorizontal,
  Plus,
  Trash2,
  CheckCircle2,
  Ban,
  Printer,
  Package,
  AlertTriangle,
  XCircle,
  Save,
  History,
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
  can,
  cancelTransfer,
  completeTransfer,
  createAdjustment,
  deleteWarehouse,
  productMovements,
  reconcileStock,
  saveTransferDraft,
  saveWarehouse,
  toggleWarehouseActive,
  unitName,
  warehouseQty,
  warehouseStock,
} from "@/lib/store";
import type { Transfer, TransferLine, User, Warehouse } from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
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
import { StatusBadge } from "@/components/modules";

/* =========================== WAREHOUSES =========================== */

export function WarehousesModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState({ code: "", name: "", location: "", description: "", active: true });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const confirm = useConfirm();
  const canEdit = can(actor.role, "edit");
  const canDelete = can(actor.role, "delete");

  function startNew() {
    setEditing(null);
    setForm({ code: "", name: "", location: "", description: "", active: true });
    setError(""); setOk("");
  }

  function startEdit(w: Warehouse) {
    setEditing(w);
    setForm({ code: w.code, name: w.name, location: w.location, description: w.description, active: w.active });
    setError(""); setOk("");
  }

  function submit() {
    if (saving) return;
    setSaving(true); setError(""); setOk("");
    try {
      const w = saveWarehouse(actor, { ...form, id: editing?.id });
      setOk(editing ? `تم تحديث المخزن ${w.name}` : `تم إضافة المخزن ${w.name}`);
      startNew();
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setSaving(false); }
  }

  const stockRows = (selected ? warehouseStock(selected) : []).map((r) => ({ id: r.product.id, ...r }));
  const selectedWarehouse = data.warehouses.find((w) => w.id === selected);

  return (
    <div className="space-y-6">
      <PageHeader title="المخازن" subtitle="إدارة المخازن وعرض الأرصدة المخزنية لكل مخزن" breadcrumbs={["الرئيسية", "المخزون", "المخازن"]} />

      {canEdit ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">{editing ? `تعديل مخزن: ${editing.name}` : "إضافة مخزن جديد"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1"><Label>الكود *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WH-003" /></div>
              <div className="space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مخزن الإسكندرية" /></div>
              <div className="space-y-1"><Label>الموقع</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="الإسكندرية" /></div>
              <div className="space-y-1"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف مختصر" /></div>
            </div>
            <ErrorBanner message={error} />
            <SuccessBanner message={ok} />
            <div className="flex gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={saving}>
                <Save className="h-4 w-4" /> {editing ? "حفظ التعديلات" : "إضافة المخزن"}
              </Button>
              {editing ? <Button variant="outline" onClick={startNew}>إلغاء</Button> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-base">قائمة المخازن ({formatNumber(data.warehouses.length)})</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            rows={data.warehouses}
            emptyTitle="لا توجد مخازن"
            emptyHint="أضف مخزنًا للبدء."
            columns={[
              { key: "code", header: "الكود", render: (w) => <span className="font-medium">{w.code}</span> },
              { key: "name", header: "الاسم", render: (w) => w.name },
              { key: "loc", header: "الموقع", render: (w) => w.location || "—" },
              { key: "desc", header: "الوصف", render: (w) => w.description || "—" },
              { key: "status", header: "الحالة", render: (w) => <StatusBadge status={w.active ? "finalized" : "cancelled"} /> },
              {
                key: "act", header: "إجراءات",
                render: (w) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" title="عرض الأرصدة" onClick={() => setSelected(w.id)}>
                      <Package className="h-4 w-4" />
                    </Button>
                    {canEdit ? (
                      <Button size="sm" variant="ghost" title="تعديل" onClick={() => startEdit(w)}>
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button size="sm" variant="ghost" title={w.active ? "تعطيل" : "تنشيط"}
                        onClick={() => { try { toggleWarehouseActive(actor, w.id); setOk(w.active ? `تم تعطيل ${w.name}` : `تم تنشيط ${w.name}`); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); } }}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" title="حذف"
                        onClick={() => confirm.request(`حذف المخزن ${w.name}؟`, () => { try { deleteWarehouse(actor, w.id); setOk(`تم حذف ${w.name}`); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); } })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {selected && selectedWarehouse ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">أرصدة «{selectedWarehouse.name}»</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>إغلاق</Button>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={stockRows}
              emptyTitle="لا توجد أرصدة"
              emptyHint="لا توجد منتجات بهذا المخزن."
              columns={[
                { key: "sku", header: "الكود", render: (r) => r.product.sku },
                { key: "name", header: "المنتج", render: (r) => r.product.name },
                { key: "unit", header: "الوحدة", render: (r) => unitName(r.product.unitId) },
                { key: "qty", header: "الكمية", render: (r) => <span className={cn("font-semibold", r.qty <= r.product.reorderLevel && "text-amber-700")}>{formatNumber(r.qty)}</span> },
                { key: "val", header: "القيمة", render: (r) => formatCurrency(r.qty * r.product.costPrice) },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog open={confirm.open} message={confirm.message} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
    </div>
  );
}

/* ============================ TRANSFERS =========================== */

function emptyTransferLine(): TransferLine {
  return { productId: "", productName: "", quantity: 1 };
}

export function TransfersModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [fromId, setFromId] = useState(data.warehouses[0]?.id ?? "");
  const [toId, setToId] = useState(data.warehouses[1]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [printTarget, setPrintTarget] = useState<Transfer | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const confirm = useConfirm();
  const canCreate = can(actor.role, "create");
  const canApprove = can(actor.role, "approve");

  const searched = useFilteredRows(data.transfers, query, (t) => [t.number, t.fromWarehouseName, t.toWarehouseName]);
  const rows = statusFilter === "all" ? searched : searched.filter((t) => t.status === statusFilter);

  function addLine() {
    setLines([...lines, emptyTransferLine()]);
  }

  function updateLine(i: number, patch: Partial<TransferLine>) {
    setLines(lines.map((l, idx) => {
      if (idx !== i) return l;
      const next = { ...l, ...patch };
      if (patch.productId) {
        const p = data.products.find((x) => x.id === patch.productId);
        if (p) next.productName = p.name;
      }
      return next;
    }));
  }

  function resetForm() { setLines([]); setNotes(""); }

  function saveDraft() {
    if (saving) return;
    setSaving(true); setError(""); setOk("");
    try {
      const t = saveTransferDraft(actor, { fromWarehouseId: fromId, toWarehouseId: toId, date: new Date(date).toISOString(), lines, notes });
      resetForm();
      setOk(`تم حفظ مسودة التحويل ${t.number}`);
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setSaving(false); }
  }

  function saveAndComplete() {
    if (saving) return;
    setSaving(true); setError(""); setOk("");
    try {
      const t = saveTransferDraft(actor, { fromWarehouseId: fromId, toWarehouseId: toId, date: new Date(date).toISOString(), lines, notes });
      completeTransfer(actor, t.id);
      resetForm();
      setOk(`تم اعتماد التحويل ${t.number}`);
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="تحويلات المخازن" subtitle="نقل الأرصدة بين المخازن مع الحفاظ على إجمالي المخزون" breadcrumbs={["الرئيسية", "المخزون", "التحويلات"]} />

      {canCreate ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">تحويل جديد</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>من مخزن *</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.warehouses.filter((w) => w.active).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>إلى مخزن *</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.warehouses.filter((w) => w.active).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">بنود التحويل</Label>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-4 w-4" /> إضافة بند</Button>
            </div>

            {lines.length === 0 ? (
              <EmptyState title="لا توجد بنود" hint="أضف بندًا لبدء التحويل." />
            ) : (
              <div className="space-y-3">
                {lines.map((line, i) => {
                  const available = line.productId ? warehouseQty(data, line.productId, fromId) : 0;
                  const over = line.productId && line.quantity > available;
                  return (
                    <div key={i} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Label className="text-xs">المنتج</Label>
                        <Select value={line.productId} onValueChange={(v) => updateLine(i, { productId: v })}>
                          <SelectTrigger><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                          <SelectContent>
                            {data.products.filter((p) => p.active).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {line.productId ? <p className="mt-1 text-xs text-slate-400">المتاح بالمصدر: {formatNumber(available)}</p> : null}
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs">الكمية</Label>
                        <Input type="number" value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className={cn(over && "border-rose-400")} />
                        {over ? <p className="mt-1 text-xs text-rose-600">الكمية أكبر من المتاح</p> : null}
                      </div>
                      <div className="flex items-end sm:col-span-4">
                        <Button variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => setLines(lines.filter((_, x) => x !== i))}>
                          <Trash2 className="h-4 w-4" /> حذف
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-1"><Label>ملاحظات</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <ErrorBanner message={error} />
            <SuccessBanner message={ok} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveDraft} disabled={saving || lines.length === 0}>
                <Save className="h-4 w-4" /> حفظ كمسودة
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveAndComplete} disabled={saving || lines.length === 0}>
                <CheckCircle2 className="h-4 w-4" /> اعتماد التحويل
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">سجل التحويلات ({formatNumber(rows.length)})</CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث برقم التحويل أو المخزن..." />
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar
            label="الحالة"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "الكل" },
              { value: "draft", label: "مسودة" },
              { value: "completed", label: "مكتمل" },
              { value: "cancelled", label: "ملغى" },
            ]}
          />
          <DataTable
            rows={rows}
            emptyTitle="لا توجد تحويلات"
            emptyHint="التحويلات التي تنشئها ستظهر هنا."
            columns={[
              { key: "num", header: "الرقم", render: (t) => <span className="font-medium">{t.number}</span> },
              { key: "from", header: "من", render: (t) => t.fromWarehouseName },
              { key: "to", header: "إلى", render: (t) => t.toWarehouseName },
              { key: "date", header: "التاريخ", render: (t) => formatDate(t.date) },
              { key: "items", header: "البنود", render: (t) => formatNumber(t.lines.length) },
              { key: "status", header: "الحالة", render: (t) => <StatusBadge status={t.status === "completed" ? "finalized" : t.status === "cancelled" ? "cancelled" : "draft"} /> },
              {
                key: "act", header: "إجراءات",
                render: (t) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" title="طباعة" onClick={() => setPrintTarget(t)}><Printer className="h-4 w-4" /></Button>
                    {t.status === "draft" && canApprove ? (
                      <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700" title="اعتماد"
                        onClick={() => { try { completeTransfer(actor, t.id); setOk(`تم اعتماد ${t.number}`); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); } }}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {t.status === "draft" && canApprove ? (
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" title="إلغاء"
                        onClick={() => confirm.request(`إلغاء التحويل ${t.number}؟`, () => { try { cancelTransfer(actor, t.id); setOk(`تم إلغاء ${t.number}`); } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); } })}>
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

      {printTarget ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">مستند التحويل {printTarget.number}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</Button>
              <Button size="sm" variant="outline" onClick={() => setPrintTarget(null)}>إغلاق</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-slate-500">من مخزن</span><span className="font-medium">{printTarget.fromWarehouseName}</span>
              <span className="text-slate-500">إلى مخزن</span><span className="font-medium">{printTarget.toWarehouseName}</span>
              <span className="text-slate-500">التاريخ</span><span className="font-medium">{formatDate(printTarget.date)}</span>
              <span className="text-slate-500">أنشئ بواسطة</span><span className="font-medium">{printTarget.createdBy}</span>
            </div>
            <Separator />
            <table className="w-full text-right">
              <thead className="text-slate-500">
                <tr><th className="py-1">المنتج</th><th className="py-1">الكمية</th></tr>
              </thead>
              <tbody>
                {printTarget.lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1">{l.productName}</td>
                    <td className="py-1">{formatNumber(l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog open={confirm.open} message={confirm.message} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
    </div>
  );
}

/* =========================== ADJUSTMENTS ========================== */

export function AdjustmentsModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState(data.warehouses[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const canApprove = can(actor.role, "approve");

  const rows = useFilteredRows(data.adjustments, query, (a) => [a.number, a.productName, a.warehouseName, a.reason]);
  const before = productId ? warehouseQty(data, productId, warehouseId) : 0;
  const after = direction === "increase" ? before + quantity : before - quantity;

  function submit() {
    if (saving) return;
    setSaving(true); setError(""); setOk("");
    try {
      const adj = createAdjustment(actor, { productId, warehouseId, date: new Date(date).toISOString(), direction, quantity, reason });
      setOk(`تم تسجيل التسوية ${adj.number}: ${formatNumber(adj.beforeQty)} ← ${formatNumber(adj.afterQty)}`);
      setProductId(""); setQuantity(1); setReason("");
    } catch (e) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="تسويات المخزون" subtitle="تعديل الأرصدة بزيادة أو نقص مع تسجيل السبب والموافقة" breadcrumbs={["الرئيسية", "المخزون", "التسويات"]} />

      {canApprove ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">تسوية جديدة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label>المنتج *</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                  <SelectContent>
                    {data.products.filter((p) => p.active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>المخزن *</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.warehouses.filter((w) => w.active).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1">
                <Label>نوع التسوية</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as "increase" | "decrease")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">زيادة</SelectItem>
                    <SelectItem value="decrease">نقص</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>الكمية *</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
              <div className="space-y-1"><Label>السبب *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تالف / جرد / فقد" /></div>
            </div>

            {productId ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
                <span className="text-slate-500">الرصيد الحالي: </span>
                <span className="font-semibold">{formatNumber(before)}</span>
                <span className="mx-2 text-slate-400">←</span>
                <span className="text-slate-500">بعد التسوية: </span>
                <span className={cn("font-semibold", after < 0 ? "text-rose-700" : "text-emerald-700")}>{formatNumber(after)}</span>
              </div>
            ) : null}

            <ErrorBanner message={error} />
            <SuccessBanner message={ok} />
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={saving || !productId || !reason.trim()}>
              <CheckCircle2 className="h-4 w-4" /> تسجيل التسوية
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-6 text-sm text-slate-500">لا تملك صلاحية اعتماد التسويات.</CardContent></Card>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">سجل التسويات ({formatNumber(rows.length)})</CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث بالمنتج أو السبب..." />
        </CardHeader>
        <CardContent>
          <DataTable
            rows={rows}
            emptyTitle="لا توجد تسويات"
            emptyHint="التسويات التي تسجلها ستظهر هنا."
            columns={[
              { key: "num", header: "الرقم", render: (a) => <span className="font-medium">{a.number}</span> },
              { key: "date", header: "التاريخ", render: (a) => formatDate(a.date) },
              { key: "prod", header: "المنتج", render: (a) => a.productName },
              { key: "wh", header: "المخزن", render: (a) => a.warehouseName },
              { key: "dir", header: "النوع", render: (a) => <Badge variant={a.direction === "increase" ? "default" : "secondary"}>{a.direction === "increase" ? "زيادة" : "نقص"}</Badge> },
              { key: "qty", header: "الكمية", render: (a) => formatNumber(a.quantity) },
              { key: "before", header: "قبل", render: (a) => formatNumber(a.beforeQty) },
              { key: "after", header: "بعد", render: (a) => formatNumber(a.afterQty) },
              { key: "reason", header: "السبب", render: (a) => a.reason },
              { key: "user", header: "المستخدم", render: (a) => a.createdBy },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ========================= MOVEMENTS VIEW ========================= */

export function MovementsModule({ actor }: { actor: User }) {
  const data = useAppData();
  const [productId, setProductId] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");

  const movements = useMemo(() => {
    let list = data.stockMovements;
    if (productId) list = list.filter((m) => m.productId === productId);
    if (warehouseFilter !== "all") list = list.filter((m) => m.warehouseId === warehouseFilter);
    if (typeFilter !== "all") list = list.filter((m) => m.type === typeFilter);
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data.stockMovements, productId, warehouseFilter, typeFilter]);

  const searched = useFilteredRows(movements, query, (m) => [m.productName, m.reference, m.reason, m.warehouseName]);

  const typeLabels: Record<string, string> = {
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

  return (
    <div className="space-y-6">
      <PageHeader title="حركات المخزون" subtitle="سجل كامل لكل حركات المخزون عبر المخازن" breadcrumbs={["الرئيسية", "المخزون", "الحركات"]} />

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">الحركات ({formatNumber(searched.length)})</CardTitle>
          <SearchInput value={query} onChange={setQuery} placeholder="بحث بالمنتج أو المرجع..." />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">المنتج</Label>
              <Select value={productId || "all"} onValueChange={(v) => setProductId(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المنتجات</SelectItem>
                  {data.products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المخزن</Label>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المخازن</SelectItem>
                  {data.warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نوع الحركة</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {Object.entries(typeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DataTable
            rows={searched}
            emptyTitle="لا توجد حركات"
            emptyHint="ستظهر الحركات هنا بعد إتمام المعاملات."
            columns={[
              { key: "date", header: "التاريخ", render: (m) => formatDateTime(m.date) },
              { key: "prod", header: "المنتج", render: (m) => m.productName },
              { key: "wh", header: "المخزن", render: (m) => m.warehouseName },
              { key: "type", header: "النوع", render: (m) => <Badge variant="outline">{typeLabels[m.type] ?? m.type}</Badge> },
              { key: "qty", header: "الكمية", render: (m) => <span className={cn("font-semibold", m.qty > 0 ? "text-emerald-700" : "text-rose-700")}>{m.qty > 0 ? "+" : ""}{formatNumber(m.qty)}</span> },
              { key: "after", header: "الرصيد بعد", render: (m) => formatNumber(m.balanceAfter) },
              { key: "ref", header: "المرجع", render: (m) => m.reference },
              { key: "reason", header: "البيان", render: (m) => m.reason },
              { key: "user", header: "المستخدم", render: (m) => m.user },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}