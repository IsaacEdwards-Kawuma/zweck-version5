/**
 * Visible only when printing — letterhead-style block for professional PDF/print output.
 */
export default function PrintStatementHeader({
  title,
  subtitle,
  meta,
  companyName = "Zweck Co. Ltd",
  companyLocation = "Kampala",
  productName
}) {
  return (
    <div className="hidden print:block print:mb-8">
      <div className="rounded-xl bg-[linear-gradient(135deg,#0b2547_0%,#1d4e89_62%,#c9a227_160%)] px-5 py-4 text-white">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">
          {String(companyName || "").trim() ? companyName : "Zweck Co. Ltd"} {companyLocation ? `· ${companyLocation}` : ""}
        </div>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm font-medium text-blue-100">{subtitle}</p> : null}
        {meta ? <p className="mt-1 text-xs text-blue-200">{meta}</p> : null}
        {productName ? <p className="mt-1 text-[10px] text-blue-200">{productName}</p> : null}
      </div>
      <div className="mt-2 h-1 rounded-full bg-[linear-gradient(90deg,#0b2547_0%,#1d4e89_60%,#c9a227_100%)]" />
    </div>
  );
}
