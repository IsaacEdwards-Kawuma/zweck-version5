import { useState } from "react";
import { getStoredTheme, setStoredTheme, applyTheme } from "../lib/theme";

const OPTIONS = [
  { id: "light", label: "Light", desc: "Always use light backgrounds." },
  { id: "dark", label: "Dark", desc: "Always use dark backgrounds." },
  { id: "system", label: "System", desc: "Follow your device setting." }
];

export default function ThemeSettings() {
  const [pref, setPref] = useState(getStoredTheme);

  function select(next) {
    setPref(next);
    setStoredTheme(next);
    applyTheme(next);
  }

  return (
    <section
      id="settings-theme"
      className="ui-surface scroll-mt-24 rounded-xl p-5"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Display theme
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Choose how ZweckOS looks on this browser. &quot;System&quot; updates when your OS light/dark mode changes.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => select(o.id)}
            className={[
              "rounded-xl border px-4 py-3 text-left transition",
              pref === o.id
                ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30 dark:border-brand-400 dark:bg-brand-950/60 dark:ring-brand-400/25"
                : "border-slate-200 bg-slate-50/80 hover:bg-white dark:border-slate-600 dark:bg-slate-900/40 dark:hover:bg-slate-800/80"
            ].join(" ")}
          >
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{o.label}</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{o.desc}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
