const FIRST_URL = /https?:\/\/[^\s<>"']+/i;

export type LinkPreviewPayload = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

function metaContent(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = re.exec(html);
  if (m) return m[1];
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,
    "i"
  );
  const m2 = re2.exec(html);
  return m2?.[1];
}

function titleFromHtml(html: string): string | undefined {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1]?.trim();
}

export function extractFirstHttpUrl(body: string): string | null {
  const m = FIRST_URL.exec(body);
  return m ? m[0].replace(/[),.;]+$/, "") : null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewPayload | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "ZweckOS-Chat/1.0",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return { url };
    const html = await res.text();
    const slice = html.slice(0, 500_000);
    const title = metaContent(slice, "og:title") || metaContent(slice, "twitter:title") || titleFromHtml(slice);
    const description =
      metaContent(slice, "og:description") || metaContent(slice, "twitter:description") || metaContent(slice, "description");
    let imageUrl = metaContent(slice, "og:image") || metaContent(slice, "twitter:image");
    if (imageUrl && imageUrl.startsWith("//")) imageUrl = `https:${imageUrl}`;
    else if (imageUrl && imageUrl.startsWith("/")) {
      try {
        const base = new URL(url);
        imageUrl = `${base.origin}${imageUrl}`;
      } catch {
        /* ignore */
      }
    }
    return {
      url,
      title: title?.slice(0, 500),
      description: description?.slice(0, 1000),
      imageUrl: imageUrl?.slice(0, 2000)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
