import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import DirectorAvatar from "../components/DirectorAvatar";
import AboutPageEditor from "../components/AboutPageEditor";
import { useDirectorsAll } from "../hooks/useDashboard";
import { getAboutPage, updateAboutPage, resetAboutPage } from "../api/aboutPage";

function clonePayload(p) {
  return JSON.parse(JSON.stringify(p));
}

export default function AboutCompany() {
  const { me } = useOutletContext() || {};
  const isAdmin = me?.role === "ADMIN";
  const qc = useQueryClient();

  const qAbout = useQuery({
    queryKey: ["about-page"],
    queryFn: getAboutPage
  });

  const q = useDirectorsAll();
  const directors = (q.data ?? [])
    .filter((d) => d.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const payload = qAbout.data?.payload;

  const mSave = useMutation({
    mutationFn: (body) => updateAboutPage(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["about-page"] });
      setEditing(false);
      setDraft(null);
    }
  });

  const mReset = useMutation({
    mutationFn: () => resetAboutPage(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["about-page"] });
      setEditing(false);
      setDraft(null);
    }
  });

  function startEdit() {
    if (!payload) return;
    setDraft(clonePayload(payload));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
  }

  async function saveEdit() {
    if (!draft) return;
    await mSave.mutateAsync(draft);
  }

  function confirmReset() {
    if (!window.confirm("Remove all custom About text and restore built-in defaults? This cannot be undone.")) return;
    mReset.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight ui-page-heading">About Zweck</h1>
          <p className="mt-1 text-sm ui-page-muted">Company information and team</p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            {qAbout.data?.isCustom ? (
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-900 dark:bg-brand-950/80 dark:text-brand-200">
                Custom content
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Default text
              </span>
            )}
            {!editing ? (
              <button
                type="button"
                onClick={startEdit}
                disabled={!payload || qAbout.isLoading}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Edit content
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={mSave.isPending || !draft}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {mSave.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={mSave.isPending}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReset}
                  disabled={mReset.isPending || mSave.isPending}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                >
                  {mReset.isPending ? "Resetting…" : "Delete custom & restore defaults"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {qAbout.isLoading ? (
        <Loading label="Loading About page…" />
      ) : qAbout.isError ? (
        <ErrorBanner error={qAbout.error} />
      ) : null}

      {mSave.isError ? <ErrorBanner error={mSave.error} /> : null}
      {mReset.isError ? <ErrorBanner error={mReset.error} /> : null}

      {editing && draft && isAdmin ? (
        <div className="ui-surface rounded-xl border-2 border-dashed border-brand-300/80 p-6 shadow-sm dark:border-brand-500/40">
          <h2 className="text-sm font-semibold text-brand-900 dark:text-brand-200">Edit About page</h2>
          <p className="mt-1 text-xs ui-page-muted">
            Changes apply to everyone. Director cards below still come from the Directors directory.
          </p>
          <div className="mt-5">
            <AboutPageEditor payload={draft} onChange={setDraft} />
          </div>
        </div>
      ) : null}

      {payload && !editing ? (
        <>
          <div className="ui-surface rounded-xl p-6 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700/80">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <img
                src="/zweck-logo.png"
                alt=""
                className="h-16 w-auto shrink-0 rounded-xl bg-white p-2 ring-1 ring-brand-200/80 dark:bg-slate-900 dark:ring-brand-500/30"
              />
              <div>
                <p className="text-lg font-semibold text-brand-900 dark:text-brand-200">{payload.headerProductName}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                  {payload.headerCompanyName}
                </p>
                <p className="mt-1 text-sm ui-body-text">{payload.headerLocation}</p>
              </div>
            </div>
            {payload.introParagraphs.map((para, i) => (
              <p key={i} className={i === 0 ? "mt-6 text-sm leading-relaxed ui-body-text" : "mt-4 text-sm leading-relaxed ui-body-text"}>
                {para}
              </p>
            ))}
          </div>

          <section className="ui-surface rounded-xl p-6 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700/80">
            <h2 className="text-lg font-semibold ui-page-heading">{payload.featuresSectionTitle}</h2>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed ui-body-text">
              {payload.featureBullets.map((item, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.title}</span>
                  {" — "}
                  {item.body}
                </li>
              ))}
            </ul>
          </section>

          <section className="ui-surface rounded-xl p-6 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700/80">
            <h2 className="text-lg font-semibold ui-page-heading">{payload.contactSectionTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed ui-body-text">{payload.contactBlurb}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold ui-page-heading">{payload.directorsSectionTitle}</h2>
            <p className="mt-1 text-sm ui-page-muted">{payload.directorsSectionIntro}</p>

            {q.isLoading ? (
              <div className="mt-6">
                <Loading label="Loading members…" />
              </div>
            ) : q.isError ? (
              <div className="mt-6">
                <ErrorBanner error={q.error} />
              </div>
            ) : directors.length === 0 ? (
              <p className="mt-6 text-sm ui-body-text">No active directors listed yet.</p>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {directors.map((d) => (
                  <Link
                    key={d.id}
                    to={`/directors/${d.id}`}
                    className="ui-surface group flex gap-4 rounded-xl p-4 shadow-sm ring-1 ring-slate-200/80 transition hover:border-brand-200/80 hover:ring-brand-200/60 dark:ring-slate-700/80 dark:hover:border-brand-500/30 dark:hover:ring-brand-500/25"
                  >
                    <DirectorAvatar director={d} size="lg" className="ring-2 ring-white shadow-sm dark:ring-slate-800" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 group-hover:text-brand-800 dark:text-slate-100 dark:group-hover:text-brand-200">
                        {d.name}
                      </div>
                      {d.occupation ? (
                        <p className="mt-1 line-clamp-2 text-sm ui-body-text">{d.occupation}</p>
                      ) : (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Director</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-brand-700 dark:text-brand-300">View profile →</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      ) : !qAbout.isLoading ? (
        <p className="text-sm ui-body-text">Unable to load About content.</p>
      ) : null}
    </div>
  );
}
