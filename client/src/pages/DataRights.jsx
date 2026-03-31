import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { getMyDataExport, requestDataErasure } from "../api/auth";
import { downloadOrgBackupJson } from "../api/admin";
import { hasAdminPrivileges } from "../lib/roles";

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataRights() {
  const { me } = useOutletContext() || {};
  const isAdmin = hasAdminPrivileges(me?.role);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);

  async function onDownloadMine() {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const data = await getMyDataExport();
      downloadJson(`zweck-my-data-${new Date().toISOString().slice(0, 10)}.json`, data);
      setOk("Download started.");
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function onErasure(e) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const res = await requestDataErasure(notes.trim() || undefined);
      setOk(res?.message || "Request recorded.");
      setNotes("");
    } catch (e2) {
      setErr(e2);
    } finally {
      setBusy(false);
    }
  }

  async function onOrgBackup() {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const data = await downloadOrgBackupJson();
      downloadJson(`zweckos-org-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
      setOk("Organisation backup download started. Keep this file secure.");
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight ui-page-heading">Data &amp; privacy rights</h1>
        <p className="mt-1 text-sm ui-page-muted">Export, requests, and backups</p>
      </div>

      {err ? <ErrorBanner error={err} /> : null}
      {ok ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          {ok}
        </div>
      ) : null}

      <section className="ui-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold ui-page-heading">Your data export</h2>
        <p className="mt-2 text-sm ui-body-text">
          Download a JSON file with your account and linked director profile, plus up to 5,000 recent transactions for
          your director record (if any). Does not include other members’ data.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onDownloadMine}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Download my data (JSON)
        </button>
      </section>

      <section className="ui-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold ui-page-heading">Erasure request</h2>
        <p className="mt-2 text-sm ui-body-text">
          Submit a request to delete your personal data. An administrator will review legal and accounting obligations
          (some records may need to be kept). You may be contacted to confirm identity.
        </p>
        <form onSubmit={onErasure} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200" htmlFor="erase-notes">
            Notes (optional)
          </label>
          <textarea
            id="erase-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900"
            placeholder="Reason or context for your request"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
          >
            Submit erasure request
          </button>
        </form>
      </section>

      {isAdmin ? (
        <section className="ui-surface rounded-xl p-6 ring-1 ring-brand-200/60 dark:ring-brand-500/30">
          <h2 className="text-lg font-semibold ui-page-heading">Organisation backup (admin)</h2>
          <p className="mt-2 text-sm ui-body-text">
            JSON snapshot of directors, meetings, documents, users (no password hashes), reconciliation notes, and up
            to 100,000 transactions (by id). For a full copy of the database, use your host’s backup tools (e.g. Neon).
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onOrgBackup}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Download organisation backup (JSON)
          </button>
        </section>
      ) : null}
    </div>
  );
}
