/**
 * @param {number|string|null|undefined} amount
 * @param {string} [currency]
 */
export function formatMoney(amount, currency = "EUR") {
  const c = currency || "EUR";
  const n = Number(amount || 0);
  if (c === "UGX") {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(n);
  }
  const iso = c === "USD" ? "USD" : "EUR";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: iso,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

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

/** Whole units (e.g. UGX). */
export function roundToWhole(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.round(x);
}

/**
 * Stable display reference for a transaction id (matches server).
 * @param {number|string|null|undefined} id
 */
export function formatTxRef(id) {
  if (id == null || id === "") return "—";
  return `ZWC-${String(id).padStart(7, "0")}`;
}

/**
 * Parse a user-typed money string (e.g. "2.23", "10,50" with comma as decimal).
 * UGX: whole numbers only. EUR/USD: max 2 decimal places.
 * @param {string} raw
 * @param {string} [currency]
 */
export function parseMoneyAmountInput(raw, currency = "EUR") {
  const s = String(raw ?? "")
    .trim()
    .replace(",", ".");
  if (s === "") return { ok: false, error: "Enter amount." };
  const n = Number(s);
  if (Number.isNaN(n)) return { ok: false, error: "Amount must be numeric." };
  if (n <= 0) return { ok: false, error: "Amount must be greater than zero." };
  if (currency === "UGX") {
    const dot = s.indexOf(".");
    if (dot !== -1) return { ok: false, error: "UGX amounts must be whole numbers (no decimals)." };
    const rounded = roundToWhole(n);
    if (Math.abs(n - rounded) > 1e-9) return { ok: false, error: "UGX amounts must be whole numbers." };
    return { ok: true, value: rounded };
  }
  const dot = s.indexOf(".");
  if (dot !== -1 && s.length - dot - 1 > 2) {
    return { ok: false, error: "Use at most two decimal places (cents)." };
  }
  const rounded = roundToCents(n);
  return { ok: true, value: rounded };
}

