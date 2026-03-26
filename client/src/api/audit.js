import api from "./client";

/**
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {string} [opts.from] ISO date
 * @param {string} [opts.to] ISO date
 * @param {number} [opts.userId]
 * @param {string} [opts.action] substring match
 * @param {string} [opts.entityType] exact match
 */
export async function listAuditLogs(opts = {}) {
  const params = { limit: typeof opts.limit === "number" ? opts.limit : 200, ...opts };
  const { data } = await api.get("/audit", { params });
  return data;
}

/** Same filters as list; downloads CSV (uses JWT from axios). */
export async function downloadAuditLogCsv(opts = {}) {
  const params = {
    format: "csv",
    limit: typeof opts.limit === "number" ? opts.limit : 5000
  };
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  if (opts.userId != null && opts.userId !== "") params.userId = opts.userId;
  if (opts.action) params.action = opts.action;
  if (opts.entityType) params.entityType = opts.entityType;

  const { data } = await api.get("/audit", { params, responseType: "blob" });
  const name = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
