import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";

export default function NotificationBell() {
  const token = typeof window !== "undefined" ? localStorage.getItem("zweck_token") : null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled: Boolean(token),
    refetchInterval: open ? 30_000 : 60_000
  });

  const mRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const mReadAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!token) return null;

  const unread = q.data?.unreadCount ?? 0;
  const items = q.data?.items ?? [];

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className="relative rounded-lg border border-slate-200/90 bg-white/95 p-2 text-slate-600 transition hover:bg-brand-50 hover:text-brand-800 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-brand-200"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                disabled={mReadAll.isPending}
                onClick={() => mReadAll.mutate()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
            {q.isLoading ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">Loading…</div>
            ) : q.error ? (
              <div className="px-3 py-4 text-center text-sm text-rose-600">Could not load notifications.</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">No notifications yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={[
                        "w-full px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/80",
                        n.readAt ? "text-slate-600 dark:text-slate-400" : "bg-brand-50/50 font-medium text-slate-900 dark:bg-brand-950/30 dark:text-slate-100"
                      ].join(" ")}
                      onClick={() => {
                        if (!n.readAt) mRead.mutate(n.id);
                        setOpen(false);
                        if (n.link) navigate(n.link);
                      }}
                    >
                      <div className="line-clamp-2">{n.title}</div>
                      {n.body ? (
                        <div className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs font-normal text-slate-500 dark:text-slate-400">
                          {n.body}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[10px] font-normal text-slate-400">
                        {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-700">
            <Link
              to="/settings#settings-notifications"
              className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              onClick={() => setOpen(false)}
            >
              Notification settings
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
