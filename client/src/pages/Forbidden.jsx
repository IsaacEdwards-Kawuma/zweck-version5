import { Link } from "react-router-dom";

export default function Forbidden() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="text-6xl font-bold text-slate-300 dark:text-slate-600">403</div>
      <div className="mt-2 text-lg font-semibold ui-page-heading">Access denied</div>
      <div className="mt-1 max-w-sm text-sm ui-body-text">
        Your account role can’t access this page. If you think this is a mistake, ask an admin to update your role.
      </div>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Back
      </Link>
    </div>
  );
}

