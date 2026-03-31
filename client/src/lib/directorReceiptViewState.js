const STORAGE_KEY = "zweck_director_receipts_seen_v1";

/** @returns {Set<string>} */
export function getSeenReceiptIds(directorId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const j = JSON.parse(raw);
    const arr = j[String(directorId)];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

export function markReceiptSeen(directorId, receiptId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const j = raw ? JSON.parse(raw) : {};
    const k = String(directorId);
    const next = new Set(j[k] || []);
    next.add(String(receiptId));
    j[k] = [...next];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
}
