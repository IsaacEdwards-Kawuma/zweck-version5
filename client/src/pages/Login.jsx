import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { login, register } from "../api/auth";

function isNetworkNoResponse(err) {
  const root = err?.cause ?? err;
  return !root?.response && (root?.code === "ERR_NETWORK" || root?.message === "Network Error");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(() => (location.pathname === "/signup" ? "signup" : "login")); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (location.pathname === "/signup") setMode("signup");
    if (location.pathname === "/login") setMode("login");
  }, [location.pathname]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = mode === "login" ? await login(email, password) : await register({ email, password });
      localStorage.setItem("zweck_token", data.token);
      nav("/");
    } catch (e2) {
      // Practical recovery: sometimes signup/login succeeds on backend but proxy/network response is dropped.
      // Retry login once; for signup flow, auto-login usually works if the account was just created.
      if (isNetworkNoResponse(e2)) {
        try {
          if (mode === "login") {
            await sleep(700);
          }
          const retry = await login(email, password);
          if (retry?.token) {
            localStorage.setItem("zweck_token", retry.token);
            nav("/");
            return;
          }
        } catch {
          // keep original error below
        }
      }
      setErr(e2);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50/50 to-accent-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
        <div className="ui-surface w-full overflow-hidden rounded-2xl border border-brand-100/80 p-6 shadow-lg shadow-brand-900/10 ring-1 ring-brand-100/50 dark:border-slate-600 dark:shadow-black/30 dark:ring-slate-600/80">
          <div className="h-1 w-full -mx-6 -mt-6 mb-5 bg-gradient-to-r from-brand-500 via-brand-400 to-accent-500" aria-hidden />
          <div className="flex items-center gap-4">
            <img
              src="/zweck-logo.png"
              alt="Zweck logo"
              className="h-14 w-auto shrink-0 rounded-xl bg-white p-1.5 ring-2 ring-brand-200/80 shadow-sm dark:bg-slate-900/80 dark:ring-brand-500/40 sm:h-20 sm:p-2 lg:h-24"
            />
            <div>
              <div className="text-lg font-semibold text-brand-900 dark:text-brand-200">ZweckOS</div>
              <div className="text-xs ui-page-muted">Zweck Tukula Co. Ltd</div>
            </div>
          </div>
          {location.state?.resetOk ? (
            <div className="mt-2 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-900 ring-1 ring-accent-200/80 dark:bg-accent-950/50 dark:text-accent-200 dark:ring-accent-800/60">
              Password updated. You can sign in now.
            </div>
          ) : null}
          <div className="mt-1 text-sm ui-body-text">
            {mode === "login" ? "Sign in to continue." : "Create a new account."}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                mode === "login"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              ].join(" ")}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                mode === "signup"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              ].join(" ")}
            >
              Sign up
            </button>
          </div>

          <form className="mt-5 space-y-3" onSubmit={onSubmit}>
            {err ? <ErrorBanner error={err} /> : null}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input
                className="ui-input mt-1 w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Password</label>
              <input
                className="ui-input mt-1 w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                minLength={mode === "signup" ? 8 : 1}
                required
              />
              {mode === "signup" ? (
                <div className="mt-1 text-xs ui-page-muted">Minimum 8 characters.</div>
              ) : null}
            </div>
            <button
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
            </button>
            {mode === "login" ? (
              <div className="text-center">
                <Link className="text-sm font-medium text-brand-700 hover:text-brand-800" to="/forgot-password">
                  Forgot password?
                </Link>
              </div>
            ) : null}
          </form>

          <div className="mt-4 text-xs ui-page-muted">
            New signups create a user account; first account is promoted to admin automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

