import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight ui-page-heading">Privacy &amp; data</h1>
        <p className="mt-1 text-sm ui-page-muted">How ZweckOS handles personal information</p>
      </div>

      <div className="ui-surface space-y-4 rounded-xl p-6 text-sm leading-relaxed ui-body-text">
        <p>
          ZweckOS stores account data needed to operate your company: user accounts, director profiles, financial
          transactions, meetings, and documents. Access is restricted by role (admin, member, user).
        </p>
        <p>
          Passwords are stored using strong hashing. Optional profile photos may be stored on the application server
          or S3-compatible object storage, depending on deployment. Audit and login history may be retained for
          security review.
        </p>
        <p>
          You can download a copy of data linked to your account and request erasure from the{" "}
          <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/legal/data-rights">
            Data &amp; privacy rights
          </Link>{" "}
          page. Erasure may be limited where law or legitimate business requires retention (for example accounting
          records).
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This summary does not replace legal advice. Adapt this text for your jurisdiction and company policy.
        </p>
      </div>
    </div>
  );
}
