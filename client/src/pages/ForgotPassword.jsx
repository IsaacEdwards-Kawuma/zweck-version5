import { useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { forgotPassword } from "../api/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setDone(true);
    } catch (e2) {
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
          <div className="text-lg font-semibold text-brand-900 dark:text-brand-200">Forgot password</div>
          <p className="mt-1 text-sm ui-body-text">
            Enter your account email. If it exists, we will send reset instructions.
          </p>

          {done ? (
            <p className="mt-5 text-sm text-slate-700">
              If an account exists for that email, we sent password reset instructions. Check your inbox (and spam).
            </p>
          ) : (
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
                  autoComplete="email"
                />
              </div>
              <button
                disabled={loading}
                className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Please wait..." : "Send reset link"}
              </button>
            </form>
          )}

          <div className="mt-5 text-sm">
            <Link className="font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200" to="/login">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
