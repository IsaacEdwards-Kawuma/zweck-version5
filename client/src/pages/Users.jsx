import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listUsers } from "../api/users";
import { useMe } from "../hooks/useMe";

export default function Users() {
  const qMe = useMe(true);
  const q = useQuery({ queryKey: ["users"], queryFn: listUsers, enabled: qMe.data?.role === "ADMIN" });

  if (qMe.isLoading || q.isLoading) return <Loading label="Loading users..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;
  if (qMe.data?.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You must be an admin to view the users list.
      </div>
    );
  }
  if (q.error) return <ErrorBanner error={q.error} />;

  const users = q.data || [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-900">Users</div>
        <div className="text-sm text-slate-600">
          Admin overview of all users with their roles and linked directors.
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Director</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.director
                    ? `${u.director.name} (${u.director.initials})`
                    : u.directorId
                    ? `#${u.directorId}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(u.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
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

