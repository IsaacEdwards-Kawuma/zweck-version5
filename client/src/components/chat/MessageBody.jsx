/** Renders plain text with http(s) URLs as clickable links; optional link preview card, light markdown, mention tint. */
function renderRichSegments(s) {
  const out = [];
  let i = 0;
  let key = 0;
  while (i < s.length) {
    const tick = s.indexOf("`", i);
    const bold = s.indexOf("**", i);
    let next = -1;
    let kind = null;
    if (tick >= 0 && (bold < 0 || tick < bold)) {
      next = tick;
      kind = "code";
    } else if (bold >= 0) {
      next = bold;
      kind = "bold";
    }
    if (next < 0) {
      out.push(<span key={`t${key++}`}>{s.slice(i)}</span>);
      break;
    }
    if (next > i) {
      out.push(<span key={`t${key++}`}>{s.slice(i, next)}</span>);
    }
    if (kind === "code") {
      const end = s.indexOf("`", next + 1);
      if (end < 0) {
        out.push(<span key={`t${key++}`}>{s.slice(next)}</span>);
        break;
      }
      out.push(
        <code
          key={`c${key++}`}
          className="rounded bg-slate-200/90 px-1 py-0.5 font-mono text-[0.92em] dark:bg-slate-700/90"
        >
          {s.slice(next + 1, end)}
        </code>
      );
      i = end + 1;
    } else {
      const end = s.indexOf("**", next + 2);
      if (end < 0) {
        out.push(<span key={`t${key++}`}>{s.slice(next)}</span>);
        break;
      }
      out.push(
        <strong key={`b${key++}`} className="font-semibold">
          {s.slice(next + 2, end)}
        </strong>
      );
      i = end + 2;
    }
  }
  return out;
}

function LinkPreviewCard({ preview }) {
  if (!preview || !preview.url) return null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex max-w-md gap-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/80 text-left text-xs dark:border-slate-600 dark:bg-slate-800/50"
    >
      {preview.imageUrl ? (
        <img
          src={preview.imageUrl}
          alt=""
          className="h-20 w-24 shrink-0 object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 py-2 pr-2">
        <div className="line-clamp-2 font-semibold text-slate-900 dark:text-slate-100">{preview.title || preview.url}</div>
        {preview.description ? (
          <div className="mt-0.5 line-clamp-2 text-slate-600 dark:text-slate-400">{preview.description}</div>
        ) : null}
        <div className="mt-1 truncate text-[10px] text-slate-500">{preview.url}</div>
      </div>
    </a>
  );
}

export default function MessageBody({
  text,
  className = "",
  linkPreview = null,
  mentionHighlight = false,
  formatRich = false
}) {
  if (text == null || text === "") return null;
  const s = String(text);

  let inner;
  if (formatRich) {
    inner = renderRichSegments(s);
  } else {
    const nodes = [];
    const re = /https?:\/\/[^\s<]+/gi;
    let last = 0;
    let mi = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) {
        nodes.push(<span key={`t${mi++}`}>{s.slice(last, m.index)}</span>);
      }
      const raw = m[0];
      const href = raw.replace(/[),.;]+$/, "");
      nodes.push(
        <a
          key={`a${mi++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-brand-700 underline dark:text-brand-300"
        >
          {href}
        </a>
      );
      if (raw.length > href.length) {
        nodes.push(<span key={`tr${mi++}`}>{raw.slice(href.length)}</span>);
      }
      last = m.index + raw.length;
    }
    if (last < s.length) {
      nodes.push(<span key={`t${mi++}`}>{s.slice(last)}</span>);
    }
    if (nodes.length === 0) {
      nodes.push(<span key="t0">{s}</span>);
    }
    inner = nodes;
  }

  return (
    <div className={mentionHighlight ? "rounded-md bg-amber-50/90 px-1 dark:bg-amber-950/40" : ""}>
      <span className={`whitespace-pre-wrap break-words ${className}`.trim()}>{inner}</span>
      <LinkPreviewCard preview={linkPreview} />
    </div>
  );
}
