import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listAuditLogs } from "../api/audit";
import { useMe } from "../hooks/useMe";

export default function AuditLog() {
  const qMe = useMe(true);
  const q = useQuery({
    queryKey: ["audit_log"],
    queryFn: () => listAuditLogs(200),
    enabled: qMe.data?.role === "ADMIN"
  });

  if (qMe.isLoading || q.isLoading) return <Loading label="Loading audit log..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;
  if (qMe.data?.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
        You must be an admin to view the audit log.
      </div>
    );
  }
  if (q.error) return <ErrorBanner error={q.error} />;

  const rows = q.data || [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold ui-page-heading">Audit log</div>
        <div className="text-sm ui-body-text">Recent actions (newest first, max 200).</div>
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
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
