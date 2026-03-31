/** Milliseconds without a heartbeat before a user is considered offline (default 2 minutes). */
export function presenceOfflineThresholdMs(): number {
  const raw = Number(process.env.PRESENCE_OFFLINE_AFTER_MS);
  if (Number.isFinite(raw) && raw >= 15_000 && raw <= 60 * 60 * 1000) return Math.floor(raw);
  return 120_000;
}
