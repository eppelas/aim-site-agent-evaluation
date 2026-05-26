import type { AgentMarkdownMirrorCheck, DiscoveredRoute, Finding, PageCheck, PageOutgoingLink, PageTextFingerprint, SiteConfig } from "./types.js";
import { fetchWithRedirects } from "./fetcher.js";
import { extractAgentSurface, extractAnchorLinks, extractDateTokens, extractMarkdownFingerprint, extractTextFingerprint, extractTitle } from "./html.js";
import { extractPageDateSignals } from "./date-freshness.js";
import { isInternalUrl, normalizeUrl, pathFromUrl, shouldVisitAsPage, uniqueUrls } from "./url-utils.js";

export async function checkPage(site: SiteConfig, route: DiscoveredRoute, now = new Date()): Promise<PageCheck> {
  const result = await fetchWithRedirects(route.url);
  const anchorLinks = result.contentType.includes("text/html") ? extractAnchorLinks(result.bodyText) : [];
  const outgoingLinks: PageOutgoingLink[] = [];
  for (const link of anchorLinks) {
    const targetUrl = normalizeUrl(link.href, result.finalUrl || route.url);
    if (!targetUrl) continue;
    outgoingLinks.push({
      sourceUrl: route.url,
      rawHref: link.href,
      targetUrl,
      text: link.text,
      section: link.section,
      sourceAnchorUrl: link.sourceAnchor ? `${route.url.split("#")[0]}#${link.sourceAnchor}` : undefined,
      isInternal: isInternalUrl(targetUrl, site)
    });
  }

  const internalLinks = uniqueUrls(outgoingLinks.filter((link) => link.isInternal && shouldVisitAsPage(link.targetUrl)).map((link) => link.targetUrl));
  const externalLinks = uniqueUrls(outgoingLinks.filter((link) => !link.isInternal).map((link) => link.targetUrl));
  const isHtml = result.ok && result.contentType.includes("text/html");
  const textFingerprint = isHtml ? extractTextFingerprint(result.bodyText) : undefined;
  const agentSurface = isHtml ? extractAgentSurface(result.bodyText, result.finalUrl) : undefined;
  const markdownMirrors = textFingerprint && agentSurface ? await checkMarkdownMirrors(agentSurface.markdownAlternates, textFingerprint) : [];

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
    textFingerprint,
    outgoingLinks,
    internalLinks,
    externalLinks,
    dateTokens: isHtml ? extractDateTokens(result.bodyText) : [],
    dateSignals: isHtml ? extractPageDateSignals(result.bodyText, now) : [],
    redirectChain: result.redirectChain,
    references: route.references,
    agentSurface,
    markdownMirrors,
    error: result.error
  };
}

async function checkMarkdownMirrors(urls: string[], htmlFingerprint: PageTextFingerprint): Promise<AgentMarkdownMirrorCheck[]> {
  const uniqueMarkdownUrls = [...new Set(urls)].slice(0, 3);
  return Promise.all(uniqueMarkdownUrls.map((url) => checkMarkdownMirror(url, htmlFingerprint)));
}

async function checkMarkdownMirror(url: string, htmlFingerprint: PageTextFingerprint): Promise<AgentMarkdownMirrorCheck> {
  const result = await fetchWithRedirects(url);
  if (!result.ok || !result.bodyText) {
    return {
      url,
      finalUrl: result.finalUrl,
      status: "failed",
      httpStatus: result.status,
      ok: result.ok,
      contentType: result.contentType,
      similarityPercent: 0,
      htmlWordCount: htmlFingerprint.wordCount,
      markdownWordCount: 0,
      sharedTopTerms: [],
      htmlOnlyTopTerms: htmlFingerprint.topTerms.slice(0, 20),
      markdownOnlyTopTerms: [],
      htmlH1Texts: htmlFingerprint.h1Texts,
      markdownH1Texts: [],
      error: result.error ?? `HTTP ${result.status}`
    };
  }

  const markdownFingerprint = extractMarkdownFingerprint(result.bodyText);
  const similarity = compareFingerprints(htmlFingerprint, markdownFingerprint);

  return {
    url,
    finalUrl: result.finalUrl,
    status: statusForMarkdownSimilarity(similarity.percent),
    httpStatus: result.status,
    ok: result.ok,
    contentType: result.contentType,
    similarityPercent: similarity.percent,
    htmlWordCount: htmlFingerprint.wordCount,
    markdownWordCount: markdownFingerprint.wordCount,
    sharedTopTerms: similarity.sharedTopTerms,
    htmlOnlyTopTerms: similarity.htmlOnlyTopTerms,
    markdownOnlyTopTerms: similarity.markdownOnlyTopTerms,
    htmlH1Texts: htmlFingerprint.h1Texts,
    markdownH1Texts: markdownFingerprint.h1Texts
  };
}

export async function checkSurfaceFiles(site: SiteConfig, now = new Date()): Promise<PageCheck[]> {
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

  return Promise.all(routes.map((route) => checkPage(site, route, now)));
}

function compareFingerprints(htmlFingerprint: PageTextFingerprint, markdownFingerprint: PageTextFingerprint): {
  percent: number;
  sharedTopTerms: string[];
  htmlOnlyTopTerms: string[];
  markdownOnlyTopTerms: string[];
} {
  const htmlTerms = htmlFingerprint.topTerms.slice(0, 40);
  const markdownTerms = markdownFingerprint.topTerms.slice(0, 40);
  const sharedTopTerms = htmlTerms.filter((term) => markdownTerms.includes(term));
  const htmlOnlyTopTerms = htmlTerms.filter((term) => !markdownTerms.includes(term)).slice(0, 20);
  const markdownOnlyTopTerms = markdownTerms.filter((term) => !htmlTerms.includes(term)).slice(0, 20);
  const termSimilarity = ratio(sharedTopTerms.length, Math.max(1, Math.min(htmlTerms.length, markdownTerms.length)));

  const sharedHeadings = htmlFingerprint.headings.filter((heading) => markdownFingerprint.headings.some((candidate) => normalizedText(candidate) === normalizedText(heading)));
  const headingSimilarity = ratio(sharedHeadings.length, Math.max(1, Math.min(htmlFingerprint.headings.length, markdownFingerprint.headings.length)));

  const h1Matches =
    htmlFingerprint.h1Texts.length > 0 &&
    markdownFingerprint.h1Texts.length > 0 &&
    normalizedText(htmlFingerprint.h1Texts[0]) === normalizedText(markdownFingerprint.h1Texts[0]);
  const h1Similarity = h1Matches ? 1 : 0;

  return {
    percent: Math.round((termSimilarity * 0.7 + headingSimilarity * 0.2 + h1Similarity * 0.1) * 100),
    sharedTopTerms,
    htmlOnlyTopTerms,
    markdownOnlyTopTerms
  };
}

function statusForMarkdownSimilarity(percent: number): AgentMarkdownMirrorCheck["status"] {
  if (percent >= 70) return "matched";
  if (percent >= 45) return "partial";
  return "mismatch";
}

function ratio(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, value / total));
}

function normalizedText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
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
  const remediation = remediationForPageFinding(check, title);
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
    remediation,
    evidence: {
      status: check.status,
      finalUrl: check.finalUrl,
      source: check.source,
      redirectChain: check.redirectChain,
      references: check.references
    }
  };
}

function remediationForPageFinding(check: PageCheck, title: string): Finding["remediation"] {
  if (title === "URL returns 404" || title === "Page returns client error" || title === "Request failed") {
    if (check.path === "/sitemap.xml") {
      return {
        owner: "seo",
        summary: "Publish a valid sitemap or remove this required surface from the QA config if staging intentionally has no sitemap yet.",
        steps: [
          "Add `/sitemap.xml` to the Astro/site build output and include all indexable staging routes.",
          "Verify the URL returns HTTP 200 with XML content.",
          "Keep this as a high-severity finding until staging is close enough to production to be crawlable."
        ]
      };
    }

    if (check.path === "/llms.txt" || check.path === "/llms-full.txt") {
      return {
        owner: "content",
        summary: "Publish agent-readable index files so LLMs can discover canonical Markdown surfaces.",
        steps: [
          "Create `/llms.txt` with canonical page links and concise guidance for agents.",
          "Create `/llms-full.txt` or intentionally downgrade/remove it from required surfaces.",
          "Link the agent index from HTML head once the files exist."
        ]
      };
    }

    if (check.source === "crawl") {
      return {
        owner: "content",
        summary: "Fix the CMS/content links that point users to this dead route, or create a redirect/page for the old path.",
        steps: [
          "Open the source references below and find the visible block or CTA containing the broken href.",
          "If the destination was renamed, replace the href with the current live route.",
          "If the old path is still expected publicly, add a route or redirect and rerun the staging QA."
        ]
      };
    }

    return {
      owner: "engineering",
      summary: "Decide whether this configured route should exist; then either restore the route or remove it from seed checks.",
      steps: [
        "Confirm whether the route is part of the expected site surface.",
        "If yes, create/fix the route or redirect.",
        "If no, remove it from the relevant `config/routes.*.json` seed list."
      ]
    };
  }

  if (title === "HTML page has no title") {
    return {
      owner: "seo",
      summary: "Add a meaningful `<title>` for browser tabs, search previews, and agent parsing.",
      steps: [
        "Set the page title from CMS metadata or route-level defaults.",
        "Keep title text specific to the page intent."
      ]
    };
  }

  return undefined;
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
    const poorReadabilityPages = htmlChecks.filter((check) => check.agentSurface?.readability.grade === "poor");

    if (markdownPages.length === 0) {
      findings.push(makeAggregateFinding(index++, siteId, htmlChecks[0].url, "agent-readability", "medium", "needs-review", "No Markdown alternates found", `${htmlChecks.length} checked HTML pages have no text/markdown alternate link.`, {
        owner: "content",
        summary: "Expose Markdown alternates for pages that agents need to understand accurately.",
        steps: [
          "Generate `.md` mirrors for key pages from the same Sanity/Astro content source.",
          "Add `<link rel=\"alternate\" type=\"text/markdown\" href=\"...\">` to HTML head.",
          "Include the Markdown links in `/llms.txt`."
        ]
      }));
    }

    if (llmsLinkedPages.length === 0) {
      findings.push(makeAggregateFinding(index++, siteId, htmlChecks[0].url, "agent-readability", "medium", "needs-review", "No llms.txt link found in HTML head", `${htmlChecks.length} checked HTML pages do not link an agent index.`, {
        owner: "engineering",
        summary: "Make the agent index discoverable from HTML.",
        steps: [
          "Publish `/llms.txt`.",
          "Add `<link rel=\"alternate\" type=\"text/plain\" title=\"Agent index (llms.txt)\" href=\"/llms.txt\">` to page head.",
          "Verify the link exists on all public layouts."
        ]
      }));
    }

    if (jsonLdPages.length === 0) {
      findings.push(makeAggregateFinding(index++, siteId, htmlChecks[0].url, "agent-readability", "medium", "needs-review", "No JSON-LD structured data found", `${htmlChecks.length} checked HTML pages have no application/ld+json blocks.`, {
        owner: "seo",
        summary: "Add JSON-LD so crawlers and agents can identify the organization, courses, events, and articles.",
        steps: [
          "Start with `Organization` JSON-LD on global layouts.",
          "Add `Course` or `Event` schema for lab pages with dates and application state.",
          "Keep JSON-LD generated from structured CMS fields, not hand-written page copy."
        ]
      }));
    }

    if (canonicalMissing.length > Math.ceil(htmlChecks.length * 0.2)) {
      findings.push(makeAggregateFinding(index++, siteId, canonicalMissing[0].url, "agent-readability", "medium", "needs-review", "Many pages are missing canonical links", `${canonicalMissing.length}/${htmlChecks.length} checked HTML pages are missing rel=canonical.`, {
        owner: "seo",
        summary: "Add canonical links to prevent duplicate route ambiguity for crawlers and agents.",
        steps: [
          "Generate absolute canonical URLs from the resolved route.",
          "Use production canonical URLs before launch; use staging canonicals only while staging is intentionally isolated.",
          "Verify each HTML page has exactly one canonical link."
        ]
      }));
    }

    if (missingMain.length > 0) {
      findings.push(makeAggregateFinding(index++, siteId, missingMain[0].url, "agent-readability", "low", "warning", "Some pages are missing semantic main", `${missingMain.length}/${htmlChecks.length} checked HTML pages are missing <main>.`, {
        owner: "engineering",
        summary: "Wrap primary page content in `<main>` to improve accessibility and machine parsing.",
        steps: [
          "Update the base layout so each page has one semantic `<main>` region.",
          "Keep header, footer, navigation, and modals outside the main region."
        ]
      }));
    }

    if (poorReadabilityPages.length > 0) {
      findings.push(makeAggregateFinding(index++, siteId, poorReadabilityPages[0].url, "agent-readability", "medium", "needs-review", "Some pages have poor agent-readability score", `${poorReadabilityPages.length}/${htmlChecks.length} checked HTML pages score below 50/100 for agent-readable surfaces.`, {
        owner: "content",
        summary: "Prioritize Markdown mirrors, JSON-LD, canonical metadata, and semantic page structure for the lowest-scoring pages.",
        steps: [
          "Open the Agent Readability table in the dashboard.",
          "Fix missing shared layout surfaces first: canonical, meta description, H1, and <main>.",
          "Then add JSON-LD and Markdown/llms.txt discovery for the pages agents should recommend accurately."
        ]
      }));
      findings[findings.length - 1].evidence = {
        pages: poorReadabilityPages.slice(0, 20).map((check) => ({
          url: check.url,
          score: check.agentSurface?.readability.score,
          percent: check.agentSurface?.readability.percent,
          grade: check.agentSurface?.readability.grade,
          gaps: check.agentSurface?.readability.gaps
        }))
      };
    }

    for (const check of htmlChecks) {
      for (const mirror of check.markdownMirrors.filter((candidate) => candidate.status !== "matched")) {
        const failed = mirror.status === "failed";
        findings.push({
          id: `finding_${String(index++).padStart(3, "0")}`,
          siteId: check.siteId,
          url: check.url,
          checkType: "agent-readability",
          severity: failed || mirror.status === "mismatch" ? "medium" : "low",
          status: failed || mirror.status === "mismatch" ? "needs-review" : "warning",
          title: failed ? "Markdown mirror is not reachable" : "Markdown mirror may not match HTML page",
          description: "A Markdown alternate exists but did not clearly match the HTML page content.",
          expected: "Markdown mirrors should be reachable and generated from the same canonical content as the HTML page.",
          actual: failed ? `Markdown mirror returned HTTP ${mirror.httpStatus}` : `Markdown mirror similarity ${mirror.similarityPercent}/100`,
          remediation: {
            owner: "content",
            summary: "Regenerate the Markdown mirror from the same page content source and keep metadata/headings aligned.",
            steps: [
              "Open the HTML page and Markdown mirror listed in evidence.",
              "Compare H1, major headings, primary CTA state, dates, and core terms.",
              "Regenerate the Markdown mirror from Sanity/Astro content rather than maintaining a separate manual copy."
            ]
          },
          evidence: { markdownMirror: mirror }
        });
      }
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
  actual: string,
  remediation?: Finding["remediation"]
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
    actual,
    remediation
  };
}
