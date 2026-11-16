import { isIP } from "node:net";

export type Icon = { contentType: string; data: Buffer };
export type Fetcher = typeof fetch;

const PAGE_LIMIT = 512 * 1024;
const ICON_LIMIT = 256 * 1024;
const TIMEOUT_MS = 5000;

/** Public http(s) targets only. The addresses come from the operator, but
 *  snd must not become a tool for requests into the internal network. */
export function publicHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isIP(host)) {
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return null;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return null;
  }
  return url;
}

async function readLimited(res: Response, limit: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Sniffs the bytes, so a page that answers /favicon.ico with HTML is not
 *  served as an image. */
export function sniffImage(data: Buffer): string | null {
  if (data.length < 4) return null;
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0 && data[1] === 0 && (data[2] === 1 || data[2] === 2) && data[3] === 0) return "image/x-icon";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const head = data.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** Icon links from a page's <head>, best first: apple-touch-icon (large,
 *  opaque), then icons by declared size, then anything named icon. */
export function iconCandidates(html: string, base: URL): URL[] {
  const found: { url: URL; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!rel.split(/\s+/).some((part) => part === "icon" || part === "apple-touch-icon")) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? /\bhref\s*=\s*([^\s>]+)/i.exec(tag)?.[1];
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href.replaceAll("&amp;", "&"), base);
    } catch {
      continue;
    }
    const size = Number(/\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    const score = (rel.includes("apple-touch-icon") ? 1000 : 0) + Math.min(size, 512) + (/\.svg(\?|$)/i.test(url.pathname) ? 200 : 0);
    found.push({ url, score });
  }
  return found.sort((a, b) => b.score - a.score).map((item) => item.url);
}

async function get(fetcher: Fetcher, url: URL): Promise<Response | null> {
  if (!publicHttpUrl(url.href)) return null;
  try {
    const res = await fetcher(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "snd-favicon/1.0", accept: "text/html,image/*;q=0.9,*/*;q=0.5" },
    });
    if (!res.ok || !publicHttpUrl(res.url || url.href)) return null;
    return res;
  } catch {
    return null;
  }
}

export async function fetchFavicon(origin: string, fetcher: Fetcher = fetch): Promise<Icon | null> {
  const base = publicHttpUrl(origin);
  if (!base) return null;
  const candidates: URL[] = [];
  const page = await get(fetcher, base);
  if (page && (page.headers.get("content-type") ?? "").includes("html")) {
    const html = await readLimited(page, PAGE_LIMIT);
    if (html) candidates.push(...iconCandidates(html.toString("utf8"), new URL(page.url || base.href)));
  }
  candidates.push(new URL("/favicon.ico", base));
  for (const url of candidates.slice(0, 5)) {
    const res = await get(fetcher, url);
    if (!res) continue;
    const data = await readLimited(res, ICON_LIMIT);
    if (!data) continue;
    const contentType = sniffImage(data);
    if (contentType) return { contentType, data };
  }
  return null;
}
