import type { SiteConfig } from "./types.js";

export function normalizeUrl(input: string, baseUrl: string): string | null {
  try {
    const url = new URL(input, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isInternalUrl(url: string, site: SiteConfig): boolean {
  return new URL(url).hostname === new URL(site.baseUrl).hostname;
}

export function pathFromUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export function routeKey(url: string): string {
  const parsed = new URL(url);
  const pathname = parsed.pathname.replace(/\/$/, "") || "/";
  return `${parsed.hostname}${pathname}${parsed.search}`;
}

export function shouldVisitAsPage(url: string): boolean {
  const parsed = new URL(url);
  const pathname = parsed.pathname;
  const lowerPathname = pathname.toLowerCase();

  if (lowerPathname.startsWith("/_next/")) return false;
  if (lowerPathname.startsWith("/_astro/")) return false;
  if (lowerPathname.startsWith("/assets/")) return false;
  if (lowerPathname.startsWith("/styles/")) return false;
  if (lowerPathname.startsWith("/cdn-cgi/")) return false;

  return !/\.(?:js|mjs|css|map|json|png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|mp4|webm|mov|mp3|wav|woff2?|ttf|otf)$/i.test(
    lowerPathname
  );
}

export function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const key = routeKey(url);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(url);
    }
  }
  return result.sort();
}

export function safeFilenameFromUrl(url: string): string {
  const parsed = new URL(url);
  const raw = `${parsed.hostname}${parsed.pathname}${parsed.search || ""}`.replace(/^\/+|\/+$/g, "");
  const cleaned = raw
    .replace(/\/+/g, "__")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "index";
}
