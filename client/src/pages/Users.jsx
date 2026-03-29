import DirectorAvatar from "../components/DirectorAvatar";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listUsers } from "../api/users";
import { useMe } from "../hooks/useMe";

function formatRoleLabel(role) {
  if (role === "OPERATIONAL_MANAGER") return "Operational manager";
  if (role === "SECRETARY") return "Secretary";
  return role;
}

export default function Users() {
  const qMe = useMe(true);
  const q = useQuery({ queryKey: ["users"], queryFn: listUsers, enabled: qMe.data?.role === "ADMIN" });

  if (qMe.isLoading || q.isLoading) return <Loading label="Loading users..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;
  if (qMe.data?.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
        You must be an admin to view the users list.
      </div>
    );
  }
  if (q.error) return <ErrorBanner error={q.error} />;

  const users = q.data || [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold ui-page-heading">Users</div>
        <div className="text-sm ui-body-text">Admin overview of all users with their roles and linked directors.</div>
      </div>

      <div className="ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="ui-table-head">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Director</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="ui-table-divide">
            {users.map((u) => (
              <tr key={u.id} className="text-slate-800 dark:text-slate-200">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                    {formatRoleLabel(u.role)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.director ? (
                    <span className="inline-flex items-center gap-2">
                      <DirectorAvatar director={u.director} size="sm" />
                      <span>
                        {u.director.name} ({u.director.initials})
                      </span>
                    </span>
                  ) : u.directorId ? (
                    `#${u.directorId}`
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  {new Date(u.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
