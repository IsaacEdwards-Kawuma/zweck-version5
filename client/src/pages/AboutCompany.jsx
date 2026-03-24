export default function AboutCompany() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight ui-page-heading">About Zweck</h1>
        <p className="mt-1 text-sm ui-page-muted">Company information</p>
      </div>

      <div className="ui-surface rounded-xl p-6 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700/80">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <img
            src="/zweck-logo.png"
            alt=""
            className="h-16 w-auto shrink-0 rounded-xl bg-white p-2 ring-1 ring-brand-200/80 dark:bg-slate-900 dark:ring-brand-500/30"
          />
          <div>
            <p className="text-lg font-semibold text-brand-900 dark:text-brand-200">ZweckOS</p>
            <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-200">Zweck Tukula Co. Ltd</p>
            <p className="mt-1 text-sm ui-body-text">Kampala, Uganda</p>
          </div>
        </div>
        <p className="mt-6 text-sm leading-relaxed ui-body-text">
          ZweckOS is the internal operating system for Zweck Tukula Co. Ltd — supporting governance, finance,
          meetings, documents, and portfolio work in one place.
        </p>
        <p className="mt-4 text-sm leading-relaxed ui-body-text">
          For questions about the business or this application, contact your administrator or company leadership.
        </p>
      </div>
    </div>
  );
}
