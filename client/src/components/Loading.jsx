export default function Loading({ label = "Loading..." }) {
  return (
    <div className="ui-surface rounded-lg p-4 text-sm text-slate-600 dark:text-slate-300">{label}</div>
  );
}
