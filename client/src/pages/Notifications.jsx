import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import PageHero from "../components/PageHero";
import { IconBolt } from "../components/Icons";
import {
  clearAllNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../api/notifications";
import { fmtDate } from "../lib/format";

function tabButtonClass(active) {
  return [
    "flex-1 rounded-md px-2 py-1 text-center text-xs font-medium transition",
    active
      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
  ].join(" ");
}

export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("unread");

  const unreadOnly = filter === "unread";
  const q = useQuery({
    queryKey: ["notifications", { unreadOnly }],
    queryFn: () => listNotifications({ limit: 100, unreadOnly: unreadOnly ? "true" : undefined }),
    refetchInterval: 60_000
  });

  const unread = q.data?.unreadCount ?? 0;
  const items = q.data?.items ?? [];

  const mRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });
  const mReadAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });
  const mClearAll = useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });
  const mDelete = useMutation({
    mutationFn: deleteNotification,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });

  const busy = mReadAll.isPending || mClearAll.isPending;

  const grouped = useMemo(() => {
    const unreadRows = [];
    const readRows = [];
    for (const n of items) {
      if (n.readAt) readRows.push(n);
      else unreadRows.push(n);
    }
    return { unreadRows, readRows };
  }, [items]);

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconBolt}
        title="Notifications"
        subtitle="Review unread notifications, then browse your recent history."
      />

      <div className="ui-animate-pop ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm ui-page-muted">
            {unread ? (
              <span>
                <strong className="text-slate-900 dark:text-slate-100">{unread}</strong> unread
              </span>
            ) : (
              "No unread notifications."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ui-btn-outline" disabled={q.isFetching} onClick={() => q.refetch()}>
              Refresh
            </button>
            {unread > 0 ? (
              <button type="button" className="ui-btn-outline" disabled={busy} onClick={() => mReadAll.mutate()}>
                Mark all read
              </button>
            ) : null}
            {items.length ? (
              <button
                type="button"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Clear all notifications? This cannot be undone.")) return;
                  mClearAll.mutate();
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/80">
          <button type="button" className={tabButtonClass(filter === "unread")} onClick={() => setFilter("unread")}>
            Unread {unread ? <span className="ml-1 tabular-nums text-rose-600 dark:text-rose-400">({unread})</span> : null}
          </button>
          <button type="button" className={tabButtonClass(filter === "all")} onClick={() => setFilter("all")}>
            All
          </button>
        </div>
      </div>

      {q.isLoading ? <Loading label="Loading notifications..." /> : null}
      {q.isError ? <ErrorBanner error={q.error} /> : null}

      {!q.isLoading && !q.isError ? (
        <div className="space-y-6">
          {filter === "unread" ? (
            <NotificationList
              title="Unread"
              rows={grouped.unreadRows}
              onClick={(n) => {
                if (!n.readAt) mRead.mutate(n.id);
                if (n.link) navigate(n.link);
              }}
              onDelete={(id) => mDelete.mutate(id)}
            />
          ) : (
            <>
              <NotificationList
                title="Unread"
                rows={grouped.unreadRows}
                onClick={(n) => {
                  if (!n.readAt) mRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
                onDelete={(id) => mDelete.mutate(id)}
              />
              <NotificationList
                title="Read"
                rows={grouped.readRows}
                onClick={(n) => {
                  if (n.link) navigate(n.link);
                }}
                onDelete={(id) => mDelete.mutate(id)}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NotificationList({ title, rows, onClick, onDelete }) {
  return (
    <section className="ui-animate-pop ui-surface rounded-2xl p-4">
      <div className="text-sm font-semibold ui-page-heading">{title}</div>
      <ul className="mt-3 space-y-2">
        {rows.map((n) => (
          <li
            key={n.id}
            className={[
              "rounded-xl border px-3 py-2",
              n.readAt
                ? "border-slate-200/70 bg-white/70 dark:border-slate-700/70 dark:bg-slate-950/30"
                : "border-brand-200/70 bg-brand-50/40 dark:border-brand-700/40 dark:bg-brand-950/25"
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onClick(n)}>
                <div className={["truncate text-sm", n.readAt ? "text-slate-800 dark:text-slate-200" : "font-semibold text-slate-900 dark:text-slate-100"].join(" ")}>
                  {n.title}
                </div>
                {n.body ? (
                  <div className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                    {n.body}
                  </div>
                ) : null}
                <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {fmtDate(n.createdAt)} {n.readAt ? "· read" : ""}
                </div>
              </button>
              <button type="button" className="ui-btn-outline-xs" onClick={() => onDelete(n.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {!rows.length ? <li className="text-sm ui-page-muted">Nothing here.</li> : null}
      </ul>
    </section>
  );
}

