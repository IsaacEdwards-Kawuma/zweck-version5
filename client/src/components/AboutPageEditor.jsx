const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
      {children}
    </label>
  );
}

export default function AboutPageEditor({ payload, onChange }) {
  function patch(p) {
    onChange({ ...payload, ...p });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Product name</Label>
          <input
            className={field}
            value={payload.headerProductName}
            onChange={(e) => patch({ headerProductName: e.target.value })}
          />
        </div>
        <div>
          <Label>Company name</Label>
          <input
            className={field}
            value={payload.headerCompanyName}
            onChange={(e) => patch({ headerCompanyName: e.target.value })}
          />
        </div>
        <div>
          <Label>Location</Label>
          <input
            className={field}
            value={payload.headerLocation}
            onChange={(e) => patch({ headerLocation: e.target.value })}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <Label>Introduction paragraphs</Label>
          <button
            type="button"
            className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200"
            onClick={() => patch({ introParagraphs: [...payload.introParagraphs, ""] })}
          >
            Add paragraph
          </button>
        </div>
        <div className="mt-2 space-y-3">
          {payload.introParagraphs.map((text, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                className={`${field} min-h-[88px] flex-1 resize-y`}
                value={text}
                onChange={(e) => {
                  const next = [...payload.introParagraphs];
                  next[i] = e.target.value;
                  patch({ introParagraphs: next });
                }}
                rows={4}
              />
              <button
                type="button"
                className="h-9 shrink-0 self-start rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                disabled={payload.introParagraphs.length <= 1}
                onClick={() => {
                  const next = payload.introParagraphs.filter((_, j) => j !== i);
                  patch({ introParagraphs: next.length ? next : [""] });
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Features section title</Label>
        <input
          className={field}
          value={payload.featuresSectionTitle}
          onChange={(e) => patch({ featuresSectionTitle: e.target.value })}
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <Label>Feature bullets</Label>
          <button
            type="button"
            className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200"
            onClick={() =>
              patch({
                featureBullets: [...payload.featureBullets, { title: "", body: "" }]
              })
            }
          >
            Add bullet
          </button>
        </div>
        <div className="mt-2 space-y-4">
          {payload.featureBullets.map((b, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                  disabled={payload.featureBullets.length <= 1}
                  onClick={() => {
                    const next = payload.featureBullets.filter((_, j) => j !== i);
                    patch({
                      featureBullets: next.length ? next : [{ title: "", body: "" }]
                    });
                  }}
                >
                  Remove bullet
                </button>
              </div>
              <div className="mt-2">
                <Label>Title</Label>
                <input
                  className={field}
                  value={b.title}
                  onChange={(e) => {
                    const next = [...payload.featureBullets];
                    next[i] = { ...next[i], title: e.target.value };
                    patch({ featureBullets: next });
                  }}
                />
              </div>
              <div className="mt-2">
                <Label>Body</Label>
                <textarea
                  className={`${field} min-h-[72px] resize-y`}
                  value={b.body}
                  onChange={(e) => {
                    const next = [...payload.featureBullets];
                    next[i] = { ...next[i], body: e.target.value };
                    patch({ featureBullets: next });
                  }}
                  rows={3}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Contact section title</Label>
        <input
          className={field}
          value={payload.contactSectionTitle}
          onChange={(e) => patch({ contactSectionTitle: e.target.value })}
        />
      </div>
      <div>
        <Label>Contact section text</Label>
        <textarea
          className={`${field} min-h-[100px] resize-y`}
          value={payload.contactBlurb}
          onChange={(e) => patch({ contactBlurb: e.target.value })}
          rows={5}
        />
      </div>

      <div>
        <Label>Directors section title</Label>
        <input
          className={field}
          value={payload.directorsSectionTitle}
          onChange={(e) => patch({ directorsSectionTitle: e.target.value })}
        />
      </div>
      <div>
        <Label>Directors section intro</Label>
        <textarea
          className={`${field} min-h-[72px] resize-y`}
          value={payload.directorsSectionIntro}
          onChange={(e) => patch({ directorsSectionIntro: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );
}
