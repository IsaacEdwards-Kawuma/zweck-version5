import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearAllNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../api/notifications";
import { formatRelativeTime } from "../lib/format";
import { notificationKindLabel } from "../lib/notificationLabels";

export default function NotificationBell() {
  const token = typeof window !== "undefined" ? localStorage.getItem("zweck_token") : null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [deletingId, setDeletingId] = useState(null);
  const rootRef = useRef(null);

  const unreadOnly = filter === "unread";

  const q = useQuery({
    queryKey: ["notifications", { unreadOnly }],
    queryFn: () => listNotifications({ limit: 50, unreadOnly: unreadOnly ? "true" : undefined }),
    enabled: Boolean(token),
    refetchInterval: open ? 20_000 : 30_000
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

  const mClearAll = useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const mDelete = useMutation({
    mutationFn: deleteNotification,
    onMutate: (id) => setDeletingId(id),
    onSettled: () => setDeletingId(null),
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

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!token) return null;

  const unread = q.data?.unreadCount ?? 0;
  const items = q.data?.items ?? [];
  const busy = mReadAll.isPending || mClearAll.isPending;

  function onClearAll() {
    if (!items.length) return;
    if (!window.confirm("Remove all notifications? This cannot be undone.")) return;
    mClearAll.mutate();
  }

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
          <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Refresh notifications"
                  disabled={q.isFetching}
                  onClick={() => q.refetch()}
                  title="Refresh"
                >
                  <svg
                    className={["h-4 w-4", q.isRefetching ? "animate-spin" : ""].join(" ")}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" />
                    <path d="M21 3v7h-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-2 flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/80">
              {[
                { id: "all", label: "All" },
                { id: "unread", label: "Unread" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={[
                    "flex-1 rounded-md px-2 py-1 text-center text-xs font-medium transition",
                    filter === tab.id
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  ].join(" ")}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                  {tab.id === "unread" && unread > 0 ? (
                    <span className="ml-1 tabular-nums text-rose-600 dark:text-rose-400">({unread})</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  disabled={busy}
                  onClick={() => mReadAll.mutate()}
                >
                  Mark all read
                </button>
              ) : null}
              {items.length > 0 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-rose-700 hover:underline dark:text-rose-400"
                  disabled={busy}
                  onClick={onClearAll}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
          <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
            {q.isLoading ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">Loading…</div>
            ) : q.error ? (
              <div className="px-3 py-4 text-center text-sm text-rose-600">Could not load notifications.</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                {unreadOnly ? "No unread notifications." : "No notifications yet."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map((n) => (
                  <li key={n.id} className="flex items-stretch gap-0">
                    <button
                      type="button"
                      className={[
                        "min-w-0 flex-1 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/80",
                        n.readAt ? "text-slate-600 dark:text-slate-400" : "bg-brand-50/50 font-medium text-slate-900 dark:bg-brand-950/30 dark:text-slate-100"
                      ].join(" ")}
                      onClick={() => {
                        if (!n.readAt) mRead.mutate(n.id);
                        setOpen(false);
                        if (n.link) navigate(n.link);
                      }}
                    >
                      <div className="line-clamp-2">
                        {notificationKindLabel(n.type) ? (
                          <span className="mr-1.5 inline-block rounded bg-slate-200/90 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-700/80 dark:text-slate-200">
                            {notificationKindLabel(n.type)}
                          </span>
                        ) : null}
                        {n.title}
                      </div>
                      {n.body ? (
                        <div className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs font-normal text-slate-500 dark:text-slate-400">
                          {n.body}
                        </div>
                      ) : null}
                      <div
                        className="mt-1 text-[10px] font-normal text-slate-400"
                        title={n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                      >
                        {n.createdAt ? formatRelativeTime(n.createdAt) : ""}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 border-l border-slate-100 px-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      aria-label="Dismiss notification"
                      title="Dismiss"
                      disabled={deletingId === n.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        mDelete.mutate(n.id);
                      }}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
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
