export function formatCurrency(value: number, currency = "EGP"): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNumber(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}