import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { login, register } from "../api/auth";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState("login"); // login | bootstrap
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = mode === "login" ? await login(email, password) : await register({ email, password });
      localStorage.setItem("zweck_token", data.token);
      nav("/");
    } catch (e2) {
      setErr(e2);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-900">ZweckOS</div>
          <div className="mt-1 text-sm text-slate-600">
            {mode === "login" ? "Sign in to continue." : "First-time setup: create the first admin user."}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                mode === "login" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
              ].join(" ")}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("bootstrap")}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                mode === "bootstrap" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
              ].join(" ")}
            >
              First Admin Setup
            </button>
          </div>

          <form className="mt-5 space-y-3" onSubmit={onSubmit}>
            {err ? <ErrorBanner error={err} /> : null}
            <div>
              <label className="text-xs font-medium text-slate-700">Email</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Password</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                minLength={mode === "bootstrap" ? 8 : 1}
                required
              />
              {mode === "bootstrap" ? (
                <div className="mt-1 text-xs text-slate-500">Minimum 8 characters.</div>
              ) : null}
            </div>
            <button
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Create Admin"}
            </button>
          </form>

          <div className="mt-4 text-xs text-slate-500">
            Note: after the first admin exists, creating users/directors must be done by an admin via the API.
          </div>
        </div>
      </div>
    </div>
  );
}

