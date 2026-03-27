import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { completeOnboarding } from "../api/auth";

const STEPS = [
  {
    title: "Welcome to ZweckOS",
    body: (
      <>
        <p>
          This workspace brings together accounting, projects, meetings, chat, and reporting in one place. These few
          screens highlight where to start.
        </p>
      </>
    )
  },
  {
    title: "Your navigation",
    body: (
      <>
        <p>
          Use the <strong>sidebar</strong> to open the main areas: <strong>Dashboard</strong> for an overview,{" "}
          <strong>Post Transaction</strong> to record money movements, and <strong>Ledger</strong> to review what was
          posted.
        </p>
        <p className="text-slate-600 dark:text-slate-400">
          Press <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">/</kbd>{" "}
          (when not typing) to jump to global search.
        </p>
      </>
    )
  },
  {
    title: "Reports & accounts",
    body: (
      <>
        <p>
          Open <strong>Reports</strong> for period summaries and exports, and <strong>Chart of Accounts</strong> to see
          how books are structured. <strong>Directors</strong> and <strong>Portfolio</strong> help track capital and
          positions.
        </p>
      </>
    )
  },
  {
    title: "Stay in sync",
    body: (
      <>
        <p>
          Use <strong>Chat</strong> for team conversations; the <strong>bell</strong> in the top bar shows notifications.
          Adjust alerts under <strong>Settings → Notifications</strong>.
        </p>
        <p>
          Anytime, open <strong>Help &amp; guides</strong> from the sidebar or footer for written tutorials—you can open
          it from the last step too.
        </p>
      </>
    )
  },
  {
    title: "You are set",
    body: (
      <>
        <p>
          Explore the dashboard next, or jump to <strong>Post Transaction</strong> when you are ready to record
          activity. You can revisit help from the sidebar whenever you need it.
        </p>
      </>
    )
  }
];

export default function OnboardingModal() {
  const [step, setStep] = useState(0);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: completeOnboarding,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
    }
  });

  const last = step === STEPS.length - 1;

  async function goFinish() {
    try {
      await m.mutateAsync();
    } catch {
      return;
    }
  }

  async function goFinishAndHelp() {
    try {
      await m.mutateAsync();
      nav("/help");
    } catch {
      // keep modal; error shown
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-desc"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900">
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500" aria-hidden />
        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pt-6">
          <div className="mb-4 flex items-center justify-center gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={[
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-6 bg-brand-600 dark:bg-brand-400" : "w-1.5 bg-slate-200 dark:bg-slate-600"
                ].join(" ")}
              />
            ))}
          </div>
          <h2 id="onboarding-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {STEPS[step].title}
          </h2>
          <div id="onboarding-desc" className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {STEPS[step].body}
          </div>
          {m.isError ? (
            <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">Could not save. Check your connection and try again.</p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
              disabled={m.isPending}
              onClick={() => void goFinish()}
            >
              Skip intro
            </button>
            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  disabled={m.isPending}
                  onClick={() => setStep((s) => s - 1)}
                >
                  Back
                </button>
              ) : null}
              {last ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    disabled={m.isPending}
                    onClick={() => void goFinish()}
                  >
                    {m.isPending ? "Saving…" : "Get started"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    disabled={m.isPending}
                    onClick={() => void goFinishAndHelp()}
                  >
                    Help &amp; guides
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  disabled={m.isPending}
                  onClick={() => setStep((s) => s + 1)}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
