export default function ErrorBanner({ error, fallback = "Something went wrong." }) {
  const message =
    error?.response?.data?.message ||
    error?.message ||
    fallback;

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {message}
    </div>
  );
}

