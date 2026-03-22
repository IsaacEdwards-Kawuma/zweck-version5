import { getApiErrorMessage } from "../lib/errors";

export default function ErrorBanner({ error, fallback = "Something went wrong." }) {
  const message = getApiErrorMessage(error, fallback);

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
      {message}
    </div>
  );
}
