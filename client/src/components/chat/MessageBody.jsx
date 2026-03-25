/** Renders plain text with http(s) URLs as clickable links (opens new tab). */
export default function MessageBody({ text, className = "" }) {
  if (text == null || text === "") return null;
  const s = String(text);
  const re = /https?:\/\/[^\s<]+/gi;
  const nodes = [];
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
    return <span className={className}>{s}</span>;
  }
  return <span className={`whitespace-pre-wrap break-words ${className}`.trim()}>{nodes}</span>;
}
