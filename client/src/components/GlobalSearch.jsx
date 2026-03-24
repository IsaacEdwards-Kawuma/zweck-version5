import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchWorkspace } from "../api/search";

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const trimmed = q.trim();
  const qSearch = useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => searchWorkspace(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 20_000
  });

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const d = qSearch.data;
  const hasResults =
    d &&
    (d.directors?.length > 0 || d.meetings?.length > 0 || d.documents?.length > 0);

  return (
    <div ref={rootRef} className="relative w-full max-w-md min-w-0">
      <label htmlFor="global-search" className="sr-only">
        Search directors, meetings, and documents
      </label>
      <input
        id="global-search"
        type="search"
        autoComplete="off"
        placeholder="Search…"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          const t = v.trim();
          setOpen(t.length >= 2);
        }}
        onFocus={(e) => {
          if (e.target.value.trim().length >= 2) setOpen(true);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none ring-brand-500/30 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      {open && trimmed.length >= 2 ? (
        <div
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(70vh,420px)] overflow-auto rounded-xl border border-slate-200 bg-white py-2 text-sm shadow-xl dark:border-slate-600 dark:bg-slate-900"
        >
          {qSearch.isLoading ? (
            <div className="px-3 py-2 text-slate-500">Searching…</div>
          ) : qSearch.isError ? (
            <div className="px-3 py-2 text-rose-600">Search failed.</div>
          ) : !hasResults ? (
            <div className="px-3 py-2 text-slate-500">No matches.</div>
          ) : (
            <ul className="space-y-3 px-2">
              {d.directors?.length ? (
                <li>
                  <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Directors
                  </div>
                  <ul className="space-y-0.5">
                    {d.directors.map((row) => (
                      <li key={`d-${row.id}`}>
                        <Link
                          role="option"
                          className="block rounded-lg px-2 py-1.5 hover:bg-brand-50 dark:hover:bg-slate-800"
                          to={`/directors/${row.id}`}
                          onClick={() => setOpen(false)}
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">{row.name}</span>
                          <span className="ml-2 text-xs text-slate-500">{row.email}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {d.meetings?.length ? (
                <li>
                  <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Meetings
                  </div>
                  <ul className="space-y-0.5">
                    {d.meetings.map((row) => (
                      <li key={`m-${row.id}`}>
                        <Link
                          role="option"
                          className="block rounded-lg px-2 py-1.5 hover:bg-brand-50 dark:hover:bg-slate-800"
                          to="/meetings"
                          onClick={() => setOpen(false)}
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">{row.title}</span>
                          <span className="ml-2 text-xs text-slate-500">{row.date}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {d.documents?.length ? (
                <li>
                  <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Documents
                  </div>
                  <ul className="space-y-0.5">
                    {d.documents.map((row) => (
                      <li key={`doc-${row.id}`}>
                        <Link
                          role="option"
                          className="block rounded-lg px-2 py-1.5 hover:bg-brand-50 dark:hover:bg-slate-800"
                          to="/documents"
                          onClick={() => setOpen(false)}
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100">{row.title}</span>
                          <span className="ml-2 text-xs text-slate-500">{row.category}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
