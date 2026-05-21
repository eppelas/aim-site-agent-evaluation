import type { DiscoveredRoute, RoutesConfig, SiteConfig } from "./types.js";
import { fetchWithRedirects } from "./fetcher.js";
import { extractAnchorLinks, extractSitemapLocs } from "./html.js";
import { isInternalUrl, normalizeUrl, pathFromUrl, routeKey, shouldVisitAsPage, uniqueUrls } from "./url-utils.js";

export interface DiscoveryOptions {
  maxCrawlPages: number;
}

export async function discoverRoutes(
  site: SiteConfig,
  routesConfig: RoutesConfig,
  options: DiscoveryOptions
): Promise<DiscoveredRoute[]> {
  const discovered: DiscoveredRoute[] = [];

  if (routesConfig.discovery.strategy.includes("sitemap") && routesConfig.discovery.sitemap) {
    const sitemapResult = await fetchWithRedirects(routesConfig.discovery.sitemap);
    if (sitemapResult.ok) {
      const sitemapUrls = extractSitemapLocs(sitemapResult.bodyText)
        .map((url) => normalizeUrl(url, site.baseUrl))
        .filter((url): url is string => Boolean(url))
        .filter((url) => isInternalUrl(url, site))
        .filter(shouldVisitAsPage);

      for (const url of uniqueUrls(sitemapUrls)) {
        discovered.push({
          siteId: site.id,
          url,
          path: pathFromUrl(url),
          source: "sitemap",
          references: [
            {
              sourceType: "sitemap",
              sourceUrl: sitemapResult.finalUrl || routesConfig.discovery.sitemap,
              href: url,
              text: "sitemap loc"
            }
          ]
        });
      }
    }
  }

  for (const seedPath of routesConfig.seedPaths) {
    const url = normalizeUrl(seedPath, site.baseUrl);
    if (url && shouldVisitAsPage(url)) {
      discovered.push({
        siteId: site.id,
        url,
        path: pathFromUrl(url),
        source: "seed",
        references: [
          {
            sourceType: "seed",
            sourceUrl: `config/routes.${site.id}.json`,
            href: seedPath,
            text: "configured seed path"
          }
        ]
      });
    }
  }

  if (routesConfig.discovery.strategy.includes("crawl")) {
    const crawlSeeds = uniqueUrls([site.baseUrl, ...discovered.map((route) => route.url)]);
    discovered.push(...(await crawlInternalLinks(site, crawlSeeds, options.maxCrawlPages)));
  }

  return dedupeRoutes(discovered);
}

async function crawlInternalLinks(site: SiteConfig, seeds: string[], maxPages: number): Promise<DiscoveredRoute[]> {
  const queue = [...seeds];
  const visited = new Set<string>();
  const found = new Map<string, DiscoveredRoute>();

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const result = await fetchWithRedirects(url);
    if (!result.ok || !result.contentType.includes("text/html")) continue;

    const links = extractAnchorLinks(result.bodyText);
    for (const link of links) {
      const normalized = normalizeUrl(link.href, result.finalUrl);
      if (!normalized || !isInternalUrl(normalized, site) || !shouldVisitAsPage(normalized)) continue;
      const key = routeKey(normalized);
      const sourceUrl = result.finalUrl || url;
      const reference = {
        sourceType: "crawl" as const,
        sourceUrl,
        href: link.href,
        text: link.text,
        section: link.section,
        sourceAnchorUrl: link.sourceAnchor ? anchorUrl(sourceUrl, link.sourceAnchor) : undefined
      };
      const existing = found.get(key);
      if (existing) {
        existing.references.push(reference);
      } else {
        found.set(key, {
          siteId: site.id,
          url: normalized,
          path: pathFromUrl(normalized),
          source: "crawl",
          references: [reference]
        });
      }
      if (!visited.has(normalized) && queue.length + visited.size < maxPages) {
        queue.push(normalized);
      }
    }
  }

  return [...found.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function dedupeRoutes(routes: DiscoveredRoute[]): DiscoveredRoute[] {
  const byUrl = new Map<string, DiscoveredRoute>();
  const sourceRank: Record<DiscoveredRoute["source"], number> = {
    sitemap: 0,
    seed: 1,
    crawl: 2,
    surface: 3
  };

  for (const route of routes) {
    const key = routeKey(route.url);
    const existing = byUrl.get(key);
    if (!existing || sourceRank[route.source] < sourceRank[existing.source]) {
      byUrl.set(key, {
        ...route,
        references: mergeReferences(route.references, existing?.references ?? [])
      });
    } else {
      existing.references = mergeReferences(existing.references, route.references);
    }
  }

  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function mergeReferences(...referenceGroups: DiscoveredRoute["references"][]): DiscoveredRoute["references"] {
  const merged = new Map<string, DiscoveredRoute["references"][number]>();
  for (const references of referenceGroups) {
    for (const reference of references) {
      const key = [
        reference.sourceType,
        reference.sourceUrl,
        reference.href,
        reference.text ?? "",
        reference.section ?? "",
        reference.sourceAnchorUrl ?? ""
      ].join("\u0000");
      if (!merged.has(key)) merged.set(key, reference);
    }
  }
  return [...merged.values()];
}

function anchorUrl(sourceUrl: string, anchor: string): string {
  const url = new URL(sourceUrl);
  url.hash = anchor;
  return url.toString();
}
