import type { DiscoveredRoute, Finding, PageCheck, SiteConfig } from "./types.js";
import { fetchWithRedirects } from "./fetcher.js";
import { extractAgentSurface, extractDateTokens, extractHrefValues, extractTitle } from "./html.js";
import { isInternalUrl, normalizeUrl, pathFromUrl, shouldVisitAsPage, uniqueUrls } from "./url-utils.js";

export async function checkPage(site: SiteConfig, route: DiscoveredRoute): Promise<PageCheck> {
  const result = await fetchWithRedirects(route.url);
  const hrefs = result.contentType.includes("text/html") ? extractHrefValues(result.bodyText) : [];
  const normalizedLinks = hrefs
    .map((href) => normalizeUrl(href, result.finalUrl || route.url))
    .filter((url): url is string => Boolean(url));

  const internalLinks = uniqueUrls(normalizedLinks.filter((url) => isInternalUrl(url, site) && shouldVisitAsPage(url)));
  const externalLinks = uniqueUrls(normalizedLinks.filter((url) => !isInternalUrl(url, site)));

  return {
    siteId: site.id,
    url: route.url,
    finalUrl: result.finalUrl,
    path: pathFromUrl(route.url),
    source: route.source,
    status: result.status,
    ok: result.ok,
    contentType: result.contentType,
    title: result.contentType.includes("text/html") ? extractTitle(result.bodyText) : null,
    internalLinks,
    externalLinks,
    dateTokens: result.ok && result.contentType.includes("text/html") ? extractDateTokens(result.bodyText) : [],
    redirectChain: result.redirectChain,
    references: route.references,
    agentSurface: result.ok && result.contentType.includes("text/html") ? extractAgentSurface(result.bodyText, result.finalUrl) : undefined,
    error: result.error
  };
}

export async function checkSurfaceFiles(site: SiteConfig): Promise<PageCheck[]> {
  const surfacePaths = ["/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt"];
  const routes: DiscoveredRoute[] = surfacePaths.map((surfacePath) => ({
    siteId: site.id,
    url: new URL(surfacePath, site.baseUrl).toString(),
    path: surfacePath,
    source: "surface",
    references: [
      {
        sourceType: "surface",
        sourceUrl: "surface-files",
        href: surfacePath,
        text: "configured surface file"
      }
    ]
  }));

  return Promise.all(routes.map((route) => checkPage(site, route)));
}

export function findingsFromPageChecks(checks: PageCheck[]): Finding[] {
  const findings: Finding[] = [];
  let index = 1;

  for (const check of checks) {
    if (check.status === 0) {
      findings.push(makeFinding(index++, check, "http", "high", "failed", "Request failed", check.error ?? "No response"));
      continue;
    }

    if (check.status >= 500) {
      findings.push(makeFinding(index++, check, "http", "critical", "failed", "Page returns server error", `HTTP ${check.status}`));
    } else if (check.status === 404) {
      const severity = check.source === "surface" && ["/llms.txt", "/llms-full.txt"].includes(check.path) ? "medium" : "high";
      const status = check.path === "/llms-full.txt" ? "warning" : "failed";
      findings.push(makeFinding(index++, check, check.path === "/sitemap.xml" ? "sitemap" : "http", severity, status, "URL returns 404", `HTTP ${check.status}`));
    } else if (check.status >= 400) {
      findings.push(makeFinding(index++, check, "http", "high", "failed", "Page returns client error", `HTTP ${check.status}`));
    }

    for (const redirect of check.redirectChain) {
      const fromProtocol = new URL(redirect.from).protocol;
      const toProtocol = new URL(redirect.to).protocol;
      if (fromProtocol === "https:" && toProtocol === "http:") {
        findings.push({
          id: `finding_${String(index++).padStart(3, "0")}`,
          siteId: check.siteId,
          url: check.url,
          checkType: "canonicalization",
          severity: "medium",
          status: "needs-review",
          title: "HTTPS URL redirects through HTTP",
          description: "A secure URL redirects to an insecure HTTP location before resolving.",
          expected: "Redirect chains should stay HTTPS-only.",
          actual: `${redirect.from} -> ${redirect.to}`,
          evidence: { redirect }
        });
      }
    }

    if (check.ok && check.contentType.includes("text/html") && !check.title) {
      findings.push(makeFinding(index++, check, "http", "low", "warning", "HTML page has no title", "Missing <title>"));
    }
  }

  findings.push(...agentSurfaceFindings(checks, index));

  return findings;
}

function makeFinding(
  index: number,
  check: PageCheck,
  checkType: Finding["checkType"],
  severity: Finding["severity"],
  status: Finding["status"],
  title: string,
  actual: string
): Finding {
  return {
    id: `finding_${String(index).padStart(3, "0")}`,
    siteId: check.siteId,
    url: check.url,
    checkType,
    severity,
    status,
    title,
    description: `${check.url} ${title.toLowerCase()}.`,
    expected: "URL should be reachable and meaningful for users, crawlers, and agents.",
    actual,
    evidence: {
      status: check.status,
      finalUrl: check.finalUrl,
      source: check.source,
      redirectChain: check.redirectChain,
      references: check.references
    }
  };
}

function agentSurfaceFindings(checks: PageCheck[], startIndex: number): Finding[] {
  const findings: Finding[] = [];
  let index = startIndex;
  const sites = [...new Set(checks.map((check) => check.siteId))];

  for (const siteId of sites) {
    const htmlChecks = checks.filter((check) => check.siteId === siteId && check.ok && check.agentSurface);
    if (htmlChecks.length === 0) continue;

    const canonicalMissing = htmlChecks.filter((check) => !check.agentSurface?.hasCanonical);
    const markdownPages = htmlChecks.filter((check) => (check.agentSurface?.markdownAlternates.length ?? 0) > 0);
    const llmsLinkedPages = htmlChecks.filter((check) => (check.agentSurface?.llmsLinks.length ?? 0) > 0);
    const jsonLdPages = htmlChecks.filter((check) => (check.agentSurface?.jsonLdCount ?? 0) > 0);
    const missingMain = htmlChecks.filter((check) => !check.agentSurface?.hasMain);

    if (markdownPages.length === 0) {
      findings.push(makeAggregateFinding(index++, siteId, htmlChecks[0].url, "agent-readability", "medium", "needs-review", "No Markdown alternates found", `${htmlChecks.length} checked HTML pages have no text/markdown alternate link.`));
    }

    if (llmsLinkedPages.length === 0) {
      findings.push(makeAggregateFinding(index++, siteId, htmlChecks[0].url, "agent-readability", "medium", "needs-review", "No llms.txt link found in HTML head", `${htmlChecks.length} checked HTML pages do not link an agent index.`));
    }

    if (jsonLdPages.length === 0) {
      findings.push(makeAggregateFinding(index++, siteId, htmlChecks[0].url, "agent-readability", "medium", "needs-review", "No JSON-LD structured data found", `${htmlChecks.length} checked HTML pages have no application/ld+json blocks.`));
    }

    if (canonicalMissing.length > Math.ceil(htmlChecks.length * 0.2)) {
      findings.push(makeAggregateFinding(index++, siteId, canonicalMissing[0].url, "agent-readability", "medium", "needs-review", "Many pages are missing canonical links", `${canonicalMissing.length}/${htmlChecks.length} checked HTML pages are missing rel=canonical.`));
    }

    if (missingMain.length > 0) {
      findings.push(makeAggregateFinding(index++, siteId, missingMain[0].url, "agent-readability", "low", "warning", "Some pages are missing semantic main", `${missingMain.length}/${htmlChecks.length} checked HTML pages are missing <main>.`));
    }
  }

  return findings;
}

function makeAggregateFinding(
  index: number,
  siteId: PageCheck["siteId"],
  url: string,
  checkType: Finding["checkType"],
  severity: Finding["severity"],
  status: Finding["status"],
  title: string,
  actual: string
): Finding {
  return {
    id: `finding_${String(index).padStart(3, "0")}`,
    siteId,
    url,
    checkType,
    severity,
    status,
    title,
    description: `${siteId} has an agent-readability surface gap.`,
    expected: "Pages should expose canonical, structured, and Markdown-readable surfaces for agents and crawlers.",
    actual
  };
}
