import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import ThemeSettings from "../components/ThemeSettings";
import { getHealth, getSettings } from "../api/settings";
import { listUsers, updateUserRole } from "../api/users";
import { listLoginEvents } from "../api/users";

const SECTION = "ui-surface scroll-mt-24 rounded-xl p-5";
const PREFS_KEY = "zweck_settings_prefs_v1";
const LOGIN_ALERT_PREFS_KEY = "zweck_login_alert_thresholds_v1";
const LOGIN_BURST_ALERT_PREFS_KEY = "zweck_login_burst_alert_v1";

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
  { href: "#settings-login-stamps", label: "Login stamps" },
  { href: "#settings-features", label: "Features" },
  { href: "#settings-security", label: "Security" },
  { href: "#settings-export", label: "Export" },
  { href: "#settings-readiness", label: "Readiness" }
];
const ADMIN_MONITORING_NAV = new Set([
  "#settings-status",
  "#settings-deployment",
  "#settings-monitoring",
  "#settings-limits",
  "#settings-export",
  "#settings-readiness"
]);

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

function loadLoginAlertPrefs() {
  try {
    const raw = localStorage.getItem(LOGIN_ALERT_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      highRisk24hThreshold: Math.max(1, Number(parsed.highRisk24hThreshold || 3)),
      mediumRisk24hThreshold: Math.max(1, Number(parsed.mediumRisk24hThreshold || 8))
    };
  } catch {
    return { highRisk24hThreshold: 3, mediumRisk24hThreshold: 8 };
  }
}

function loadLoginBurstAlertPrefs() {
  try {
    const raw = localStorage.getItem(LOGIN_BURST_ALERT_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      threshold: Math.max(1, Number(parsed.threshold || 5)),
      windowMinutes: Math.max(1, Number(parsed.windowMinutes || 10))
    };
  } catch {
    return { threshold: 5, windowMinutes: 10 };
  }
}

export default function Settings() {
  const loginAlertPrefs = loadLoginAlertPrefs();
  const loginBurstPrefs = loadLoginBurstAlertPrefs();
  const qc = useQueryClient();
  const [copyMsg, setCopyMsg] = useState("");
  const [sectionQuery, setSectionQuery] = useState("");
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [loginQuery, setLoginQuery] = useState("");
  const [loginStateFilter, setLoginStateFilter] = useState("ALL");
  const [loginRiskFilter, setLoginRiskFilter] = useState("ALL");
  const [loginOutcomeFilter, setLoginOutcomeFilter] = useState("ALL");
  const [loginFrom, setLoginFrom] = useState("");
  const [loginTo, setLoginTo] = useState("");
  const [loginSort, setLoginSort] = useState("NEWEST");
  const [loginPage, setLoginPage] = useState(1);
  const [loginPageSize, setLoginPageSize] = useState(25);
  const [selectedLoginUserId, setSelectedLoginUserId] = useState(null);
  const [highRisk24hThreshold, setHighRisk24hThreshold] = useState(loginAlertPrefs.highRisk24hThreshold);
  const [mediumRisk24hThreshold, setMediumRisk24hThreshold] = useState(loginAlertPrefs.mediumRisk24hThreshold);
  const [failedBurstThreshold, setFailedBurstThreshold] = useState(loginBurstPrefs.threshold);
  const [failedBurstWindowMinutes, setFailedBurstWindowMinutes] = useState(loginBurstPrefs.windowMinutes);
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
  const qLoginEvents = useQuery({
    queryKey: ["login_events_admin_settings"],
    queryFn: () => listLoginEvents(500),
    enabled: qSettings.data?.session?.role === "ADMIN"
  });

  const s = qSettings.data;
  const app = s?.app || {};
  const runtime = s?.runtime || {};
  const runtimeMemory = runtime?.memory || {};
  const deployment = s?.deployment || {};
  const monitoring = s?.monitoring || {};
  const rateLimits = s?.rateLimits || {};
  const session = s?.session || {};
  const isAdmin = session.role === "ADMIN";
  const clientSentry = Boolean(import.meta.env.VITE_SENTRY_DSN?.trim());
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const docsUrl = `${origin}/api/docs`;
  const openapiUrl = `${origin}/api/openapi.json`;
  const healthUrl = `${origin}/api/health`;
  const navQuery = sectionQuery.trim().toLowerCase();
  const visibleNav = isAdmin ? NAV : NAV.filter((n) => !ADMIN_MONITORING_NAV.has(n.href));
  const filteredNav = navQuery ? visibleNav.filter((n) => n.label.toLowerCase().includes(navQuery)) : visibleNav;
  const loginRows = qLoginEvents.data || [];
  const filteredLoginRows = loginRows.filter((r) => {
    const q = loginQuery.trim().toLowerCase();
    if (q) {
      const hay = `${r.user?.email || ""} ${r.ip || ""} ${r.userAgent || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (loginStateFilter !== "ALL" && String(r.sessionState || "") !== loginStateFilter) return false;
    if (loginRiskFilter !== "ALL" && String(r.riskLevel || "LOW") !== loginRiskFilter) return false;
    if (loginOutcomeFilter !== "ALL") {
      const ok = r.success !== false;
      if (loginOutcomeFilter === "SUCCESS" && !ok) return false;
      if (loginOutcomeFilter === "FAILED" && ok) return false;
    }
    const day = String(r.createdAt || "").slice(0, 10);
    if (loginFrom && day < loginFrom) return false;
    if (loginTo && day > loginTo) return false;
    return true;
  });
  const sortedLoginRows = filteredLoginRows
    .slice()
    .sort((a, b) => {
      if (loginSort === "OLDEST") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (loginSort === "RISK_DESC") {
        const score = (r) => (r.riskLevel === "HIGH" ? 2 : r.riskLevel === "MEDIUM" ? 1 : 0);
        return score(b) - score(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (loginSort === "DURATION_DESC") {
        return Number(b.sessionDurationMinutes || 0) - Number(a.sessionDurationMinutes || 0);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const totalLoginPages = Math.max(1, Math.ceil(sortedLoginRows.length / Math.max(1, loginPageSize)));
  const safeLoginPage = Math.min(Math.max(1, loginPage), totalLoginPages);
  const pagedLoginRows = sortedLoginRows.slice((safeLoginPage - 1) * loginPageSize, safeLoginPage * loginPageSize);
  const uniqueUsers = new Set(filteredLoginRows.map((r) => r.userId)).size;
  const avgDurationMin = filteredLoginRows.length
    ? Math.round(filteredLoginRows.reduce((s, r) => s + Number(r.sessionDurationMinutes || 0), 0) / filteredLoginRows.length)
    : 0;
  const activeEstimateCount = filteredLoginRows.filter((r) => r.sessionState === "ACTIVE_ESTIMATE").length;
  const riskyCount = filteredLoginRows.filter((r) => r.riskLevel && r.riskLevel !== "LOW").length;
  const failedCount = filteredLoginRows.filter((r) => r.success === false).length;
  const selectedUserRows = selectedLoginUserId == null ? [] : loginRows.filter((r) => Number(r.userId) === Number(selectedLoginUserId));
  const selectedUserEmail = selectedUserRows[0]?.user?.email || (selectedLoginUserId != null ? `#${selectedLoginUserId}` : "");
  const selectedUserHigh = selectedUserRows.filter((r) => r.riskLevel === "HIGH").length;
  const selectedUserMedium = selectedUserRows.filter((r) => r.riskLevel === "MEDIUM").length;
  const selectedUserAvgMin = selectedUserRows.length
    ? Math.round(selectedUserRows.reduce((sum, r) => sum + Number(r.sessionDurationMinutes || 0), 0) / selectedUserRows.length)
    : 0;
  const nowMs = Date.now();
  const inLast24h = (iso) => nowMs - new Date(iso).getTime() <= 24 * 60 * 60 * 1000;
  const inLast7d = (iso) => nowMs - new Date(iso).getTime() <= 7 * 24 * 60 * 60 * 1000;
  const high24h = loginRows.filter((r) => r.riskLevel === "HIGH" && inLast24h(r.createdAt)).length;
  const medium24h = loginRows.filter((r) => r.riskLevel === "MEDIUM" && inLast24h(r.createdAt)).length;
  const high7d = loginRows.filter((r) => r.riskLevel === "HIGH" && inLast7d(r.createdAt)).length;
  const medium7d = loginRows.filter((r) => r.riskLevel === "MEDIUM" && inLast7d(r.createdAt)).length;
  const failedBurst24h = loginRows.filter(
    (r) => inLast24h(r.createdAt) && Array.isArray(r.riskReasons) && r.riskReasons.includes("FAILED_BURST_10M")
  ).length;
  const failedBurstAlertWindowMs = Number(failedBurstWindowMinutes || 10) * 60 * 1000;
  const failedRowsByUser = loginRows
    .filter((r) => r.success === false)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .reduce((acc, row) => {
      const k = String(row.userId);
      if (!acc[k]) acc[k] = [];
      acc[k].push(new Date(row.createdAt).getTime());
      return acc;
    }, {});
  const configurableBurstHits24h = Object.values(failedRowsByUser).reduce((sum, arr) => {
    let localHits = 0;
    for (let i = 0; i < arr.length; i += 1) {
      const start = arr[i];
      const end = start + failedBurstAlertWindowMs;
      let count = 1;
      for (let j = i + 1; j < arr.length; j += 1) {
        if (arr[j] <= end) count += 1;
        else break;
      }
      if (count >= Number(failedBurstThreshold || 5) && nowMs - start <= 24 * 60 * 60 * 1000) {
        localHits += 1;
      }
    }
    return sum + localHits;
  }, 0);
  const showHighAlert = high24h >= Number(highRisk24hThreshold || 0);
  const showMediumAlert = medium24h >= Number(mediumRisk24hThreshold || 0);

  if (qSettings.isLoading) return <Loading label="Loading settings..." />;
  if (qSettings.error) return <ErrorBanner error={qSettings.error} />;

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

  function saveLoginAlertPrefs(next) {
    localStorage.setItem(LOGIN_ALERT_PREFS_KEY, JSON.stringify(next));
  }
  function saveLoginBurstAlertPrefs(next) {
    localStorage.setItem(LOGIN_BURST_ALERT_PREFS_KEY, JSON.stringify(next));
  }

  return (
    <div className="space-y-8 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {isAdmin
              ? "Account summary, shortcuts, application map, and server monitoring (read-only)."
              : "Account summary, shortcuts, and application map."}
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
            onClick={() => copyText(app.version || "", "API version copied.")}
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
          <span className="font-medium text-brand-900 dark:text-brand-200">{session.email || "—"}</span>
          <span
            className={[
              "ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide align-middle",
              session.role === "ADMIN"
                ? "bg-violet-100 text-violet-800 ring-1 ring-violet-200/80"
                : session.role === "DIRECTOR"
                  ? "bg-accent-100 text-accent-800 ring-1 ring-accent-200/80"
                  : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
            ].join(" ")}
          >
            {session.role || "USER"}
          </span>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-300">
            Last login:{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {session.lastLoginAt ? new Date(session.lastLoginAt).toLocaleString() : "—"}
            </strong>
          </span>
          <Link
            className="font-medium text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline"
            to="/forgot-password"
          >
            Password reset
          </Link>
          {session.role === "ADMIN" ? (
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
          {session.role === "DIRECTOR" && session.directorId != null ? (
            <Link
              to={`/directors/${session.directorId}`}
              className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-900 ring-1 ring-accent-200/80 hover:bg-accent-200"
            >
              My director profile
            </Link>
          ) : null}
        </div>
      </section>

      <ThemeSettings />

      {isAdmin ? <section id="settings-status" className={SECTION}>
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
      </section> : null}

      {isAdmin ? <section id="settings-deployment" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Deployment readiness
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Fast checks for production configuration and security posture.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatusDot ok={deployment.jwtConfigured} label="JWT secret configured" />
          <StatusDot ok={!deployment.authDisabled} label="Auth enabled" />
          <StatusDot ok={deployment.databaseUrlConfigured} label="Database URL configured" />
          <StatusDot ok={deployment.directUrlConfigured} label="Direct DB URL configured" />
          <StatusDot ok={deployment.allowedOriginsConfigured} label="Allowed origins configured" />
          <StatusDot ok={deployment.vercelPreviewOriginsEnabled} label="Vercel preview origins enabled" />
        </div>
      </section> : null}

      {isAdmin ? <section id="settings-monitoring" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Server monitoring</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          API {app.version || "—"} · {runtime.nodeEnv || "—"} · up {formatUptime(runtime.uptimeSeconds || 0)} · heap{" "}
          {runtimeMemory.heapUsedMb ?? "—"} MB · RSS {runtimeMemory.rssMb ?? "—"} MB
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatusDot ok={monitoring.structuredLogging} label="Structured logs (pino)" />
          <StatusDot ok={monitoring.sentryServer} label="Sentry (server)" />
          <StatusDot ok={clientSentry} label="Sentry (browser build)" />
          <StatusDot ok={monitoring.smtpConfigured} label="SMTP (password reset email)" />
          <StatusDot ok={monitoring.publicAppUrlConfigured} label="Public app URL for reset links" />
          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500 shadow-sm shadow-sky-500/30" aria-hidden />
            <span>
              Director avatars:{" "}
              <strong>{monitoring.avatarStorage === "s3" ? "S3 / object storage" : "Local disk"}</strong>
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Log level (server):{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-900 dark:text-slate-200">{monitoring.logLevel || "—"}</code>
        </p>
      </section> : null}

      {isAdmin ? <section id="settings-limits" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rate limits (server)</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Configured via environment variables; values shown are active limits, not live usage.
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">General API (per IP, per window)</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {rateLimits.apiRequestsPerWindow ?? "—"} / {rateLimits.apiWindowMinutes ?? "—"} min
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Login &amp; reset password attempts</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {rateLimits.loginRequestsPerWindow ?? "—"} / {rateLimits.loginWindowMinutes ?? "—"} min (login)
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Forgot-password requests</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {rateLimits.forgotPasswordPerHour ?? "—"} / {rateLimits.forgotPasswordWindowMinutes ?? "—"} min
            </dd>
          </div>
        </dl>
      </section> : null}

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
                    const isSelf = u.id === session.userId;
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

      {isAdmin ? (
        <section id="settings-login-stamps" className={SECTION}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Login stamp log</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Admin-only visibility into who logged in, when, session duration, and risk signals.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="ui-stat-strip rounded-lg px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Logins (filtered)</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{filteredLoginRows.length}</div>
            </div>
            <div className="ui-stat-strip rounded-lg px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Unique users</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{uniqueUsers}</div>
            </div>
            <div className="ui-stat-strip rounded-lg px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Active (estimate)</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{activeEstimateCount}</div>
            </div>
            <div className="ui-stat-strip rounded-lg px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Avg session (min)</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{avgDurationMin}</div>
            </div>
            <div className="ui-stat-strip rounded-lg px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Risky events</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{riskyCount}</div>
            </div>
            <div className="ui-stat-strip rounded-lg px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Failed logins</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{failedCount}</div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alert thresholds (24h)</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-600 dark:text-slate-300">
                  High risk count
                  <input
                    type="number"
                    min={1}
                    className="ui-input mt-1"
                    value={highRisk24hThreshold}
                    onChange={(e) => {
                      const next = Math.max(1, Number(e.target.value || 1));
                      setHighRisk24hThreshold(next);
                      saveLoginAlertPrefs({ highRisk24hThreshold: next, mediumRisk24hThreshold });
                    }}
                  />
                </label>
                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Medium risk count
                  <input
                    type="number"
                    min={1}
                    className="ui-input mt-1"
                    value={mediumRisk24hThreshold}
                    onChange={(e) => {
                      const next = Math.max(1, Number(e.target.value || 1));
                      setMediumRisk24hThreshold(next);
                      saveLoginAlertPrefs({ highRisk24hThreshold, mediumRisk24hThreshold: next });
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk trend</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="text-slate-600 dark:text-slate-300">High (24h)</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{high24h}</div>
                <div className="text-slate-600 dark:text-slate-300">Medium (24h)</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{medium24h}</div>
                <div className="text-slate-600 dark:text-slate-300">High (7d)</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{high7d}</div>
                <div className="text-slate-600 dark:text-slate-300">Medium (7d)</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{medium7d}</div>
                <div className="text-slate-600 dark:text-slate-300">Failed burst (24h)</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{failedBurst24h}</div>
              </div>
            </div>
          </div>
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Burst alert tuning</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="text-xs text-slate-600 dark:text-slate-300">
                Failed attempts threshold
                <input
                  type="number"
                  min={1}
                  className="ui-input mt-1"
                  value={failedBurstThreshold}
                  onChange={(e) => {
                    const next = Math.max(1, Number(e.target.value || 1));
                    setFailedBurstThreshold(next);
                    saveLoginBurstAlertPrefs({ threshold: next, windowMinutes: failedBurstWindowMinutes });
                  }}
                />
              </label>
              <label className="text-xs text-slate-600 dark:text-slate-300">
                Window (minutes)
                <input
                  type="number"
                  min={1}
                  className="ui-input mt-1"
                  value={failedBurstWindowMinutes}
                  onChange={(e) => {
                    const next = Math.max(1, Number(e.target.value || 1));
                    setFailedBurstWindowMinutes(next);
                    saveLoginBurstAlertPrefs({ threshold: failedBurstThreshold, windowMinutes: next });
                  }}
                />
              </label>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                Server burst rule: {rateLimits.failedLoginBurstThreshold ?? 5} attempts in{" "}
                {rateLimits.failedLoginBurstWindowMinutes ?? 10} minutes
              </div>
            </div>
          </div>
          {failedBurst24h > 0 ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
              Alert: {failedBurst24h} failed-login burst event(s) detected in the last 24 hours.
            </div>
          ) : null}
          {configurableBurstHits24h > 0 ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              Config alert: {configurableBurstHits24h} burst pattern(s) matched your local rule in last 24h.
            </div>
          ) : null}
          {showHighAlert ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
              Alert: high-risk login activity crossed threshold ({high24h} in last 24h).
            </div>
          ) : null}
          {showMediumAlert ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              Warning: medium-risk login activity crossed threshold ({medium24h} in last 24h).
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-6">
            <input className="ui-input" placeholder="Search email, IP, user agent..." value={loginQuery} onChange={(e) => setLoginQuery(e.target.value)} />
            <select className="ui-input" value={loginOutcomeFilter} onChange={(e) => setLoginOutcomeFilter(e.target.value)}>
              <option value="ALL">All outcomes</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
            <select className="ui-input" value={loginStateFilter} onChange={(e) => setLoginStateFilter(e.target.value)}>
              <option value="ALL">All states</option>
              <option value="ACTIVE_ESTIMATE">Active (estimate)</option>
              <option value="ENDED">Ended</option>
            </select>
            <select className="ui-input" value={loginRiskFilter} onChange={(e) => setLoginRiskFilter(e.target.value)}>
              <option value="ALL">All risk levels</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <input className="ui-input" type="date" value={loginFrom} onChange={(e) => setLoginFrom(e.target.value)} />
            <input className="ui-input" type="date" value={loginTo} onChange={(e) => setLoginTo(e.target.value)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="ui-btn-outline-xs" onClick={() => { setLoginRiskFilter("HIGH"); setLoginPage(1); }}>
              Quick: High risk
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => { setLoginOutcomeFilter("FAILED"); setLoginPage(1); }}>
              Quick: Failed only
            </button>
            <button
              type="button"
              className="ui-btn-outline-xs"
              onClick={() => {
                setLoginQuery("");
                setLoginStateFilter("ALL");
                setLoginRiskFilter("ALL");
                setLoginOutcomeFilter("ALL");
                setLoginFrom("");
                setLoginTo("");
                setLoginSort("NEWEST");
                setLoginPage(1);
              }}
            >
              Reset filters
            </button>
            <select className="ui-input max-w-[220px]" value={loginSort} onChange={(e) => { setLoginSort(e.target.value); setLoginPage(1); }}>
              <option value="NEWEST">Sort: Newest first</option>
              <option value="OLDEST">Sort: Oldest first</option>
              <option value="RISK_DESC">Sort: Highest risk</option>
              <option value="DURATION_DESC">Sort: Longest session</option>
            </select>
            <select
              className="ui-input max-w-[160px]"
              value={loginPageSize}
              onChange={(e) => {
                setLoginPageSize(Number(e.target.value || 25));
                setLoginPage(1);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="ui-btn-outline-xs"
              onClick={() => {
                const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
                const csv = [
                  ["When", "Email", "Role", "IP", "Session state", "Duration (min)", "Risk", "Risk reasons", "User agent"]
                    .map(esc)
                    .join(","),
                  ...sortedLoginRows.map((r) =>
                    [
                      r.createdAt,
                      r.user?.email || "",
                      r.user?.role || "",
                      r.ip || "",
                      r.sessionState || "",
                      r.sessionDurationMinutes ?? "",
                      r.riskLevel || "LOW",
                      Array.isArray(r.riskReasons) ? r.riskReasons.join("|") : "",
                      r.userAgent || ""
                    ]
                      .map(esc)
                      .join(",")
                  )
                ].join("\r\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "login-stamp-log.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export login log CSV
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => void qLoginEvents.refetch()}>
              Refresh login log
            </button>
            {selectedLoginUserId != null ? (
              <button type="button" className="ui-btn-outline-xs" onClick={() => setSelectedLoginUserId(null)}>
                Clear selected user
              </button>
            ) : null}
          </div>
          {qLoginEvents.isLoading ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading login stamps…</div>
          ) : qLoginEvents.error ? (
            <div className="mt-3">
              <ErrorBanner error={qLoginEvents.error} />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/70">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Outcome</th>
                    <th className="px-4 py-2">IP</th>
                    <th className="px-4 py-2">Session state</th>
                    <th className="px-4 py-2">Duration (min)</th>
                    <th className="px-4 py-2">Risk</th>
                    <th className="px-4 py-2">User agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {pagedLoginRows.map((r) => (
                    <tr
                      key={r.id}
                      className={[
                        "cursor-pointer text-slate-800 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/40",
                        selectedLoginUserId === r.userId ? "bg-brand-50/60 dark:bg-brand-950/20" : ""
                      ].join(" ")}
                      onClick={() => setSelectedLoginUserId(r.userId)}
                    >
                      <td className="px-4 py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <div>{r.user?.email || `#${r.userId}`}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{r.user?.role || "—"}</div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.success === false ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">FAILED</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">SUCCESS</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{r.ip || "—"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.sessionState === "ACTIVE_ESTIMATE" ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">ACTIVE_ESTIMATE</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">ENDED</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{r.sessionDurationMinutes ?? "—"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.riskLevel === "HIGH" ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">HIGH</span>
                        ) : r.riskLevel === "MEDIUM" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">MEDIUM</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">LOW</span>
                        )}
                        {Array.isArray(r.riskReasons) && r.riskReasons.length ? (
                          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{r.riskReasons.join(", ")}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 max-w-[340px] truncate" title={r.userAgent || ""}>{r.userAgent || "—"}</td>
                    </tr>
                  ))}
                  {!pagedLoginRows.length ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500 dark:text-slate-400" colSpan={8}>
                        No login records for selected filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <div>
              Showing {(safeLoginPage - 1) * loginPageSize + (pagedLoginRows.length ? 1 : 0)}-
              {(safeLoginPage - 1) * loginPageSize + pagedLoginRows.length} of {sortedLoginRows.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ui-btn-outline-xs"
                disabled={safeLoginPage <= 1}
                onClick={() => setLoginPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span>
                Page {safeLoginPage} / {totalLoginPages}
              </span>
              <button
                type="button"
                className="ui-btn-outline-xs"
                disabled={safeLoginPage >= totalLoginPages}
                onClick={() => setLoginPage((p) => Math.min(totalLoginPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
          {selectedLoginUserId != null ? (
            <div className="mt-4 rounded-xl border border-brand-200/70 bg-brand-50/40 p-4 dark:border-brand-800/50 dark:bg-brand-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Selected user timeline</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {selectedUserEmail} · {selectedUserRows.length} login events · Avg session {selectedUserAvgMin} min
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">HIGH: {selectedUserHigh}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">MEDIUM: {selectedUserMedium}</span>
                </div>
              </div>
              <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {selectedUserRows
                    .slice()
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((r) => (
                      <li key={`selected-${r.id}`} className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{new Date(r.createdAt).toLocaleString()}</span>
                          <span>IP: {r.ip || "—"}</span>
                          <span>Duration: {r.sessionDurationMinutes ?? "—"} min</span>
                          <span>State: {r.sessionState || "—"}</span>
                          <span>Risk: {r.riskLevel || "LOW"}</span>
                        </div>
                        {Array.isArray(r.riskReasons) && r.riskReasons.length ? (
                          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            Reasons: {r.riskReasons.join(", ")}
                          </div>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
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

      {isAdmin ? <section id="settings-export" className={SECTION}>
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
              app,
              runtime,
              deployment,
              monitoring,
              rateLimits,
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
      </section> : null}

      {isAdmin ? <section id="settings-readiness" className={SECTION}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Production readiness</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          High-level rollout checklist for persistence, monitoring, and operations.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatusDot ok={Boolean(s?.readiness?.workspacePersistence)} label="Workspace persistence enabled" />
          <StatusDot ok={Boolean(s?.readiness?.meetingsApi)} label="Meetings API active" />
          <StatusDot ok={Boolean(s?.readiness?.documentsApi)} label="Documents API active" />
          <StatusDot ok={Boolean(s?.readiness?.reconciliationApi)} label="Reconciliation API active" />
          <StatusDot ok={Boolean(s?.readiness?.sentryAlertsConfigured)} label="Sentry alerts configured" />
          <StatusDot ok={Boolean(s?.readiness?.incidentRunbookConfigured)} label="Incident runbook linked" />
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Recommended env vars: <code className="rounded bg-slate-100 px-1 dark:bg-slate-900">SENTRY_ALERT_WEBHOOK</code>,{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-900">SENTRY_ALERT_EMAIL</code>,{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-900">INCIDENT_RUNBOOK_URL</code>.
        </p>
      </section> : null}
    </div>
  );
}
