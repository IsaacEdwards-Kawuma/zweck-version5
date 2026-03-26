import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listAuditLogs, downloadAuditLogCsv } from "../api/audit";
import { listLoginEvents } from "../api/users";
import { useMe } from "../hooks/useMe";

export default function AuditLog() {
  const qMe = useMe(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");

  const auditParams = useMemo(() => {
    const p = { limit: 200 };
    if (from) p.from = from;
    if (to) p.to = to;
    if (userId.trim()) {
      const n = Number(userId);
      if (Number.isFinite(n) && n > 0) p.userId = n;
    }
    if (action.trim()) p.action = action.trim();
    if (entityType.trim()) p.entityType = entityType.trim();
    return p;
  }, [from, to, userId, action, entityType]);

  const q = useQuery({
    queryKey: ["audit_log", auditParams],
    queryFn: () => listAuditLogs(auditParams),
    enabled: qMe.data?.role === "ADMIN"
  });
  const qLogins = useQuery({
    queryKey: ["login_events"],
    queryFn: () => listLoginEvents(200),
    enabled: qMe.data?.role === "ADMIN"
  });

  const hasActiveFilters = Boolean(
    from || to || userId.trim() || action.trim() || entityType.trim()
  );

  if (qMe.isLoading || q.isLoading || qLogins.isLoading) return <Loading label="Loading audit log..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;
  if (qMe.data?.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
        You must be an admin to view the audit log.
      </div>
    );
  }
  if (q.error) return <ErrorBanner error={q.error} />;
  if (qLogins.error) return <ErrorBanner error={qLogins.error} />;

  const rows = q.data || [];
  const loginRows = qLogins.data || [];

  async function onExportCsv() {
    try {
      await downloadAuditLogCsv({ ...auditParams, limit: 5000 });
    } catch (e) {
      window.alert(e?.message || "Export failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold ui-page-heading">Audit log</div>
        <div className="text-sm ui-body-text">Recent actions (newest first). Use filters to narrow; export applies the same filters (up to 5000 rows).</div>
      </div>

      <div className="ui-surface rounded-xl p-4 print:hidden">
        <div className="text-sm font-semibold ui-page-heading">Filters</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="aud-from">
              From
            </label>
            <input
              id="aud-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ui-input mt-1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="aud-to">
              To
            </label>
            <input id="aud-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ui-input mt-1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="aud-user">
              User id
            </label>
            <input
              id="aud-user"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="ui-input mt-1 w-28"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="aud-action">
              Action contains
            </label>
            <input
              id="aud-action"
              type="text"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="ui-input mt-1 min-w-[10rem]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="aud-entity">
              Entity type
            </label>
            <input
              id="aud-entity"
              type="text"
              placeholder="exact match"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="ui-input mt-1 min-w-[10rem]"
            />
          </div>
          <button
            type="button"
            className="ui-btn-outline text-slate-700"
            onClick={() => {
              setFrom("");
              setTo("");
              setUserId("");
              setAction("");
              setEntityType("");
            }}
          >
            Clear filters
          </button>
          <button
            type="button"
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200 dark:hover:bg-brand-900/60"
            onClick={() => void onExportCsv()}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="ui-table-head">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Id</th>
            </tr>
          </thead>
          <tbody className="ui-table-divide">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">#{r.userId}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">{r.action}</td>
                <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                  <div>{r.entityType}</div>
                  {r.before != null || r.after != null ? (
                    <pre className="mt-1 max-h-28 max-w-md overflow-auto rounded bg-slate-50 p-2 text-[10px] leading-snug text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                      {JSON.stringify({ before: r.before, after: r.after }, null, 2)}
                    </pre>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{r.entityId ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  {hasActiveFilters
                    ? "No audit entries match these filters. Try clearing a filter or widening the date range."
                    : "No audit entries yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-lg font-semibold ui-page-heading">Login history</div>
        <div className="text-sm ui-body-text">Recent successful sign-ins (newest first, max 200).</div>
      </div>

      <div className="ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="ui-table-head">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">User Agent</th>
            </tr>
          </thead>
          <tbody className="ui-table-divide">
            {loginRows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{r.user?.email || `#${r.userId}`}</td>
                <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{r.user?.role || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{r.ip || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                  <span className="inline-block max-w-[28rem] truncate align-bottom" title={r.userAgent || ""}>
                    {r.userAgent || "—"}
                  </span>
                </td>
              </tr>
            ))}
            {!loginRows.length && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  No login entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
