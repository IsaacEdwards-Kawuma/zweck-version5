export function eur(amount) {
  const n = Number(amount || 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(n);
}

/** Shorter EUR for chart axes (k / M). */
export function eurCompact(amount) {
  const n = Number(amount || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `€${(n / 1_000).toFixed(1)}k`;
  return eur(n);
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

/** Format a fraction in [0,1] as a percentage with optional decimal places. */
export function pctFmt01(p, digits = 1) {
  const n = Number(p || 0) * 100;
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(digits)}%`;
}

/** Round a finite number to 2 decimal places (euros + cents). */
export function roundToCents(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.round(x * 100) / 100;
}

/**
 * Parse a user-typed money string (e.g. "2.23", "10,50" with comma as decimal).
 * Returns { ok: true, value } in euros with at most cent precision, or { ok: false, error }.
 */
export function parseMoneyAmountInput(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(",", ".");
  if (s === "") return { ok: false, error: "Enter amount." };
  const n = Number(s);
  if (Number.isNaN(n)) return { ok: false, error: "Amount must be numeric." };
  if (n <= 0) return { ok: false, error: "Amount must be greater than zero." };
  const dot = s.indexOf(".");
  if (dot !== -1 && s.length - dot - 1 > 2) {
    return { ok: false, error: "Use at most two decimal places (cents)." };
  }
  const rounded = roundToCents(n);
  return { ok: true, value: rounded };
}

