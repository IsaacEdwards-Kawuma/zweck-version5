/**
 * Visible only when printing — letterhead-style block for professional PDF/print output.
 */
export default function PrintStatementHeader({ title, subtitle, meta }) {
  return (
    <div className="hidden print:block print:mb-8 print:border-b-[3px] print:border-brand-700 print:pb-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Zweck Co. Ltd · Kampala</div>
      <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm font-medium text-slate-800">{subtitle}</p> : null}
      {meta ? <p className="mt-1 text-xs text-slate-600">{meta}</p> : null}
    </div>
  );
}
