import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import ThemeSettings from "../components/ThemeSettings";
import { getHealth, getSettings } from "../api/settings";
import { listUsers, updateUserRole } from "../api/users";

const SECTION = "ui-surface scroll-mt-24 rounded-xl p-5";
const PREFS_KEY = "zweck_settings_prefs_v1";

function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusDot({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={[
          "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
          ok ? "bg-emerald-500 shadow-sm shadow-emerald-500/40" : "bg-slate-300"
        ].join(" ")}
        aria-hidden
      />
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

const APP_FEATURES = [
  {
    title: "Dashboard",
    to: "/",
    description: "Balances, charts, and key figures derived from posted transactions."
  },
  {
    title: "Reports",
    to: "/reports",
    description: "Financial statements and exports; print-friendly layouts."
  },
  {
    title: "Post transaction",
    to: "/post",
    description: "Create double-entry postings (contributions, charges, and operations)."
  },
  {
    title: "Ledger",
    to: "/ledger",
    description: "Transaction list with filters and detail."
  },
  {
    title: "Chart of accounts",
    to: "/accounts",
    description: "Account structure and balances from the journal."
  },
  {
    title: "Directors",
    to: "/directors",
    description: "Member profiles, rounds, and avatars."
  },
  {
    title: "Portfolio",
    to: "/portfolio",
    description: "Per-director holdings and statements."
  },
  {
    title: "Projects",
    to: "/projects",
    description: "Projects and task workspace."
  }
];

const NAV = [
  { href: "#settings-account", label: "Account" },
  { href: "#settings-workspace", label: "Workspace" },
  { href: "#settings-theme", label: "Theme" },
  { href: "#settings-status", label: "API status" },
  { href: "#settings-deployment", label: "Deployment" },
  { href: "#settings-monitoring", label: "Monitoring" },
  { href: "#settings-limits", label: "Rate limits" },
  { href: "#settings-api-docs", label: "API docs" },
  { href: "#settings-user-roles", label: "User roles" },
  { href: "#settings-features", label: "Features" },
  { href: "#settings-security", label: "Security" },
  { href: "#settings-export", label: "Export" }
];

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      defaultLanding: parsed.defaultLanding || "/",
      compactTables: Boolean(parsed.compactTables),
      autoRefreshSec: Number(parsed.autoRefreshSec || 60)
    };
  } catch {
    return { defaultLanding: "/", compactTables: false, autoRefreshSec: 60 };
  }
}

export default function Settings() {
  const qc = useQueryClient();
  const [copyMsg, setCopyMsg] = useState("");
  const [sectionQuery, setSectionQuery] = useState("");
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const qSettings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const qHealth = useQuery({ queryKey: ["health"], queryFn: getHealth, refetchInterval: 60_000 });
  const qUsers = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: qSettings.data?.session?.role === "ADMIN"
  });
  const mRole = useMutation({
    mutationFn: ({ id, role }) => updateUserRole(id, role),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      setCopyMsg("User role updated.");
      setTimeout(() => setCopyMsg(""), 2500);
    }
  });

  if (qSettings.isLoading) return <Loading label="Loading settings..." />;
  if (qSettings.error) return <ErrorBanner error={qSettings.error} />;

  const s = qSettings.data;
  const isAdmin = s.session.role === "ADMIN";
  const clientSentry = Boolean(import.meta.env.VITE_SENTRY_DSN?.trim());
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const docsUrl = `${origin}/api/docs`;
  const openapiUrl = `${origin}/api/openapi.json`;
  const healthUrl = `${origin}/api/health`;
  const filteredNav = useMemo(() => {
    const q = sectionQuery.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.filter((n) => n.label.toLowerCase().includes(q));
  }, [sectionQuery]);

  function savePrefs(next) {
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    setCopyMsg("Local preferences saved.");
    setTimeout(() => setCopyMsg(""), 1800);
  }

  async function refreshAll() {
    setCopyMsg("");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["settings"] }),
      qc.invalidateQueries({ queryKey: ["health"] })
    ]);
  }

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg(okMessage);
      setTimeout(() => setCopyMsg(""), 2500);
    } catch {
      setCopyMsg("Clipboard blocked — copy manually.");
      setTimeout(() => setCopyMsg(""), 3000);
    }
  }

  return (
    <div className="space-y-8 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Account summary, shortcuts, application map, and server monitoring (read-only).
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Last updated:{" "}
            {qSettings.dataUpdatedAt ? new Date(qSettings.dataUpdatedAt).toLocaleString() : "—"} · Mode:{" "}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800 dark:text-slate-200">
              {import.meta.env.MODE}
            </code>
            {qHealth.isFetching ? " · Refreshing health…" : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Refresh data
          </button>
          <button
            type="button"
            onClick={() => copyText(origin || "", "App URL copied.")}
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200 dark:hover:bg-brand-900/60"
          >
            Copy app URL
          </button>
          <button
            type="button"
            onClick={() => copyText(s.app.version || "", "API version copied.")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Copy API version
          </button>
        </div>
      </div>
      {copyMsg ? (
        <div className="text-sm text-emerald-800 dark:text-emerald-300">{copyMsg}</div>
      ) : null}

      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60"
      >
        <input
          className="ui-input min-w-[200px] px-3 py-1.5"
          placeholder="Find section..."
          value={sectionQuery}
          onChange={(e) => setSectionQuery(e.target.value)}
        />
        {filteredNav.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-brand-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-brand-50 dark:bg-slate-800 dark:text-brand-200 dark:ring-slate-600 dark:hover:bg-slate-700"
          >
            {n.label}
          </a>
        ))}
      </nav>

      <section id="settings-workspace" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workspace preferences</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Local-only productivity preferences for this browser/device.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Default landing page
            <select
              className="ui-input mt-1 w-full"
              value={prefs.defaultLanding}
              onChange={(e) => savePrefs({ ...prefs, defaultLanding: e.target.value })}
            >
              <option value="/">Dashboard</option>
              <option value="/reports">Reports</option>
              <option value="/ledger">Ledger</option>
              <option value="/projects">Projects</option>
              <option value="/directors">Directors</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Health refresh interval (sec)
            <input
              className="ui-input mt-1 w-full"
              type="number"
              min={15}
              step={5}
              value={prefs.autoRefreshSec}
              onChange={(e) => savePrefs({ ...prefs, autoRefreshSec: Number(e.target.value || 60) })}
            />
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={prefs.compactTables}
              onChange={(e) => savePrefs({ ...prefs, compactTables: e.target.checked })}
            />
            Compact table density (future pages)
          </label>
        </div>
      </section>

      <section id="settings-account" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your account</h2>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Signed in as{" "}
          <span className="font-medium text-brand-900 dark:text-brand-200">{s.session.email}</span>
          <span
            className={[
              "ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide align-middle",
              s.session.role === "ADMIN"
                ? "bg-violet-100 text-violet-800 ring-1 ring-violet-200/80"
                : s.session.role === "DIRECTOR"
                  ? "bg-accent-100 text-accent-800 ring-1 ring-accent-200/80"
                  : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
            ].join(" ")}
          >
            {s.session.role}
          </span>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Link
            className="font-medium text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline"
            to="/forgot-password"
          >
            Password reset
          </Link>
          {s.session.role === "ADMIN" ? (
            <>
              <Link
                to="/users"
                className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200/80 hover:bg-brand-200"
              >
                Users
              </Link>
              <Link
                to="/audit"
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200/80 hover:bg-amber-100"
              >
                Audit
              </Link>
            </>
          ) : null}
          {s.session.role === "DIRECTOR" && s.session.directorId != null ? (
            <Link
              to={`/directors/${s.session.directorId}`}
              className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-900 ring-1 ring-accent-200/80 hover:bg-accent-200"
            >
              My director profile
            </Link>
          ) : null}
        </div>
      </section>

      <ThemeSettings />

      <section id="settings-status" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">API &amp; live status</h2>
        {qHealth.error ? (
          <p className="mt-2 text-sm text-rose-700">Health check failed — API may be unreachable.</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <StatusDot ok={qHealth.data?.ok} label={qHealth.data?.ok ? "API reachable" : "Unknown"} />
            <span className="text-slate-600 dark:text-slate-300">
              Avatar storage:{" "}
              <strong className="text-slate-900 dark:text-slate-100">{qHealth.data?.avatarStorage ?? "—"}</strong>
            </span>
            <a
              className="font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
              href={healthUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open /api/health
            </a>
          </div>
        )}
      </section>

      <section id="settings-deployment" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Deployment readiness
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Fast checks for production configuration and security posture.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatusDot ok={s.deployment.jwtConfigured} label="JWT secret configured" />
          <StatusDot ok={!s.deployment.authDisabled} label="Auth enabled" />
          <StatusDot ok={s.deployment.databaseUrlConfigured} label="Database URL configured" />
          <StatusDot ok={s.deployment.directUrlConfigured} label="Direct DB URL configured" />
          <StatusDot ok={s.deployment.allowedOriginsConfigured} label="Allowed origins configured" />
          <StatusDot ok={s.deployment.vercelPreviewOriginsEnabled} label="Vercel preview origins enabled" />
        </div>
      </section>

      <section id="settings-monitoring" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Server monitoring</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          API {s.app.version} · {s.runtime.nodeEnv} · up {formatUptime(s.runtime.uptimeSeconds)} · heap{" "}
          {s.runtime.memory.heapUsedMb} MB · RSS {s.runtime.memory.rssMb} MB
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatusDot ok={s.monitoring.structuredLogging} label="Structured logs (pino)" />
          <StatusDot ok={s.monitoring.sentryServer} label="Sentry (server)" />
          <StatusDot ok={clientSentry} label="Sentry (browser build)" />
          <StatusDot ok={s.monitoring.smtpConfigured} label="SMTP (password reset email)" />
          <StatusDot ok={s.monitoring.publicAppUrlConfigured} label="Public app URL for reset links" />
          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500 shadow-sm shadow-sky-500/30" aria-hidden />
            <span>
              Director avatars:{" "}
              <strong>{s.monitoring.avatarStorage === "s3" ? "S3 / object storage" : "Local disk"}</strong>
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Log level (server):{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-900 dark:text-slate-200">{s.monitoring.logLevel}</code>
        </p>
      </section>

      <section id="settings-limits" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rate limits (server)</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Configured via environment variables; values shown are active limits, not live usage.
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">General API (per IP, per window)</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {s.rateLimits.apiRequestsPerWindow} / {s.rateLimits.apiWindowMinutes} min
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Login &amp; reset password attempts</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {s.rateLimits.loginRequestsPerWindow} / {s.rateLimits.loginWindowMinutes} min (login)
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Forgot-password requests</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {s.rateLimits.forgotPasswordPerHour} / {s.rateLimits.forgotPasswordWindowMinutes} min
            </dd>
          </div>
        </dl>
      </section>

      <section id="settings-api-docs" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">API documentation</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          OpenAPI spec and interactive Swagger UI (same origin as the app).
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a
            className="font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Swagger UI
          </a>
          <a
            className="font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
            href={openapiUrl}
            target="_blank"
            rel="noreferrer"
          >
            openapi.json
          </a>
        </div>
      </section>

      {isAdmin ? (
        <section id="settings-user-roles" className={SECTION}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            User role management
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Admins can change roles for other users. Your own role cannot be changed here.
          </p>

          {qUsers.isLoading ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading users…</div>
          ) : qUsers.error ? (
            <div className="mt-3">
              <ErrorBanner error={qUsers.error} />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/70">
                  <tr>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Current role</th>
                    <th className="px-4 py-2">Set role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {(qUsers.data || []).map((u) => {
                    const isSelf = u.id === s.session.userId;
                    return (
                      <tr key={u.id} className="text-slate-800 dark:text-slate-200">
                        <td className="px-4 py-2">{u.email}</td>
                        <td className="px-4 py-2">{u.role}</td>
                        <td className="px-4 py-2">
                          <select
                            className="ui-input max-w-[180px]"
                            value={u.role}
                            disabled={isSelf || mRole.isPending}
                            onChange={(e) => {
                              const nextRole = e.target.value;
                              if (nextRole === u.role) return;
                              mRole.mutate({ id: u.id, role: nextRole });
                            }}
                          >
                            <option value="USER">USER</option>
                            <option value="DIRECTOR">DIRECTOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                          {isSelf ? (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">You</div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {mRole.error ? (
            <div className="mt-3">
              <ErrorBanner error={mRole.error} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section id="settings-features" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Application features</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Quick links into ZweckOS. Financial figures are always derived from posted transactions.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {APP_FEATURES.map((f) => (
            <li key={f.to}>
              <Link
                to={f.to}
                className="block rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50/50"
              >
                <div className="font-medium text-brand-900">{f.title}</div>
                <div className="mt-1 text-xs text-slate-600">{f.description}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="settings-security"
        className="scroll-mt-24 rounded-xl border border-amber-100 bg-amber-50/50 p-5 dark:border-amber-900/40 dark:bg-amber-950/30"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/90">
          Security &amp; compliance notes
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-950/90 dark:text-amber-100/90">
          <li>JWT sessions; sign out clears the token on this device.</li>
          <li>Audit log records selected changes (admins).</li>
          <li>Production: configure SMTP and public app URL for password reset emails.</li>
          <li>Optional: Sentry DSN on server and Vite build for error monitoring.</li>
        </ul>
      </section>

      <section id="settings-export" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Export diagnostics</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Download a redacted environment snapshot for support and troubleshooting.
        </p>
        <button
          type="button"
          className="mt-3 ui-btn-outline"
          onClick={() => {
            const payload = {
              generatedAt: new Date().toISOString(),
              app: s.app,
              runtime: s.runtime,
              deployment: s.deployment,
              monitoring: s.monitoring,
              rateLimits: s.rateLimits,
              localPreferences: prefs
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "zweck-settings-diagnostics.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download diagnostics JSON
        </button>
      </section>
    </div>
  );
}
