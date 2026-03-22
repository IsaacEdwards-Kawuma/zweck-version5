import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="text-6xl font-bold text-slate-300 dark:text-slate-600">404</div>
      <div className="mt-2 text-lg font-semibold ui-page-heading">Page not found</div>
      <div className="mt-1 max-w-sm text-sm ui-body-text">
        This URL does not match any screen in ZweckOS. Use the sidebar or go back to the dashboard.
      </div>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
