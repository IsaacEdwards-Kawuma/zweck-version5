export function eur(amount) {
  const n = Number(amount || 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(n);
}

export function ugx(amount) {
  const n = Number(amount || 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(isoLike) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return String(isoLike ?? "");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function pct01(p) {
  const n = Number(p || 0);
  return `${Math.round(n * 100)}%`;
}

