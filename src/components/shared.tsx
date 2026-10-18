import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSnapshot, subscribe } from "@/lib/store";
import type { AppData } from "@/lib/types";

/* --------------------------- data hook ---------------------------- */

export function useAppData(): AppData {
  const [snapshot, setSnapshot] = useState<AppData>(() => getSnapshot());
  useEffect(() => {
    const unsub = subscribe(() => setSnapshot(getSnapshot()));
    setSnapshot(getSnapshot());
    return unsub;
  }, []);
  return snapshot;
}

/* --------------------------- confirm hook ------------------------- */

export interface PendingConfirm {
  message: string;
  action: () => void;
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  return {
    pending,
    request: (message: string, action: () => void) => setPending({ message, action }),
    clear: () => setPending(null),
    /* Convenience props so a screen can pass them straight to <ConfirmDialog />. */
    open: pending !== null,
    message: pending?.message ?? "",
    cancel: () => setPending(null),
    confirm: () => {
      const p = pending;
      setPending(null);
      p?.action();
    },
  };
}

/* --------------------------- search hook -------------------------- */

export function useFilteredRows<T>(rows: T[], query: string, fields: (row: T) => string[]): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => fields(row).some((f) => (f ?? "").toLowerCase().includes(q)));
  }, [rows, query, fields]);
}

/* ---------------------------- components -------------------------- */

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
}) {
  return (
    <div className="space-y-1">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="flex items-center gap-1 text-xs text-slate-400">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 ? <ChevronLeft className="h-3 w-3" /> : null}
              {b}
            </span>
          ))}
        </div>
      ) : null}
      <h1 className="font-serif text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
      {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
    </div>
  );
}

export function FilterBar({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label ? <span className="text-xs text-slate-500">{label}:</span> : null}
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            value === o.value
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {message}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  emptyTitle,
  emptyHint,
}: {
  rows: T[];
  columns: Column<T>[];
  emptyTitle: string;
  emptyHint?: string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
            {columns.map((c) => (
              <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 font-medium", c.className)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2 align-middle", c.className)}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title = "تأكيد العملية",
  message,
  confirmLabel = "تأكيد",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-xl">
        <CardContent className="space-y-4 p-6">
          <h3 className="font-serif text-lg font-bold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">{message}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>إلغاء</Button>
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}