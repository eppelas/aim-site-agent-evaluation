import type { AgentReadabilityScore, AgentSurface, PageTextFingerprint } from "./types.js";

export interface ExtractedAnchorLink {
  href: string;
  text?: string;
  section?: string;
  sourceAnchor?: string;
}

export function extractHrefValues(html: string): string[] {
  return extractAnchorLinks(html).map((link) => link.href);
}

export function extractAnchorLinks(html: string): ExtractedAnchorLink[] {
  const links: ExtractedAnchorLink[] = [];
  const cleanedHtml = stripNonContent(html);
  const tokenRegex = /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>|<(?:section|article|main|div)\b[^>]*>|<a\b[^>]*>[\s\S]*?<\/a>|<area\b[^>]*>/gi;
  let currentHeading: string | undefined;
  let currentSectionAnchor: string | undefined;
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokenRegex.exec(cleanedHtml)) !== null) {
    const token = tokenMatch[0];

    if (/^<h[1-6]\b/i.test(token)) {
      currentHeading = cleanVisibleText(token);
      const headingId = getAttribute(token, "id");
      if (headingId) currentSectionAnchor = headingId;
      continue;
    }

    if (/^<(?:section|article|main|div)\b/i.test(token)) {
      const sectionId = getAttribute(token, "id");
      if (sectionId) currentSectionAnchor = sectionId;
      continue;
    }

    const tag = token;
    const hrefMatch = tag.match(/\shref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
    if (!href) continue;

    const ownAnchor = getAttribute(tag, "id") ?? getAttribute(tag, "name") ?? currentSectionAnchor;
    links.push({
      href: decodeHtml(href.trim()),
      text: cleanVisibleText(tag) || undefined,
      section: currentHeading,
      sourceAnchor: ownAnchor ?? undefined
    });
  }

  return links;
}

export function extractAgentSurface(html: string, baseUrl: string): AgentSurface {
  const linkTags = extractLinkTags(html);
  const markdownAlternates = linkTags
    .filter((link) => link.rel.includes("alternate") && /text\/markdown/i.test(link.type ?? ""))
    .map((link) => normalizeHref(link.href, baseUrl))
    .filter((href): href is string => Boolean(href));
  const llmsLinks = linkTags
    .filter((link) => /llms(?:-full)?\.txt$/i.test(link.href) || /agent index/i.test(link.title ?? ""))
    .map((link) => normalizeHref(link.href, baseUrl))
    .filter((href): href is string => Boolean(href));
  const sitemapLinks = linkTags
    .filter((link) => link.rel.includes("sitemap") || /sitemap\.xml$/i.test(link.href))
    .map((link) => normalizeHref(link.href, baseUrl))
    .filter((href): href is string => Boolean(href));

  const surface = {
    hasCanonical: linkTags.some((link) => link.rel.includes("canonical")),
    markdownAlternates,
    llmsLinks,
    sitemapLinks,
    jsonLdCount: countJsonLdScripts(html),
    hasMain: /<main\b/i.test(html),
    h1Count: countMatches(html, /<h1\b/gi),
    hasMetaDescription: /<meta\b[^>]*(?:name=["']description["'][^>]*content=|content=["'][^"']+["'][^>]*name=["']description["'])/i.test(html)
  };

  return {
    ...surface,
    readability: scoreAgentSurface(surface)
  };
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return decodeHtml(stripTags(match[1]).replace(/\s+/g, " ").trim()) || null;
}

export function extractTextFingerprint(html: string): PageTextFingerprint {
  const headings = extractHeadings(html);
  const h1Texts = extractHeadings(html, 1);
  const text = extractVisibleText(html);
  return buildTextFingerprint(text, headings, h1Texts);
}

export function extractMarkdownFingerprint(markdown: string): PageTextFingerprint {
  const headings: string[] = [];
  const h1Texts: string[] = [];
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  let headingMatch: RegExpExecArray | null;

  while ((headingMatch = headingPattern.exec(markdown)) !== null) {
    const text = cleanMarkdownText(headingMatch[2]);
    if (!text) continue;
    headings.push(text);
    if (headingMatch[1] === "#") h1Texts.push(text);
  }

  return buildTextFingerprint(stripMarkdownSyntax(markdown), headings, h1Texts);
}

function buildTextFingerprint(text: string, headings: string[], h1Texts: string[]): PageTextFingerprint {
  const termCounts = new Map<string, number>();
  for (const term of tokenizeContent(text)) {
    termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }
  const topTerms = [...termCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, 80)
    .map(([term]) => term);

  return {
    h1Texts,
    headings,
    topTerms,
    wordCount: [...termCounts.values()].reduce((sum, count) => sum + count, 0),
    textSample: text.slice(0, 800)
  };
}

function stripMarkdownSyntax(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMarkdownText(input: string): string {
  return stripMarkdownSyntax(input).replace(/\s+/g, " ").trim();
}

export function extractDateTokens(html: string): string[] {
  const text = extractVisibleText(html);
  const patterns = [
    /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/giu,
    /\b(?:январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь)\b/giu,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/giu,
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/gu,
    /\b20\d{2}\b/gu
  ];
  const tokens = new Set<string>();

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) tokens.add(match[0]);
  }

  return [...tokens].sort((a, b) => a.localeCompare(b, "ru"));
}

export function extractVisibleText(html: string): string {
  return stripNonContent(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(xml)) !== null) {
    locs.push(decodeHtml(match[1].trim()));
  }

  return locs;
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

function cleanVisibleText(input: string): string {
  return decodeHtml(stripTags(input).replace(/\s+/g, " ").trim());
}

function stripNonContent(input: string): string {
  return input
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 16)));
}

interface LinkTag {
  rel: string[];
  href: string;
  type?: string;
  title?: string;
}

function extractLinkTags(html: string): LinkTag[] {
  const tags: LinkTag[] = [];
  const tagRegex = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[0];
    const href = getAttribute(tag, "href");
    if (!href) continue;
    tags.push({
      rel: (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean),
      href: decodeHtml(href),
      type: getAttribute(tag, "type") ?? undefined,
      title: getAttribute(tag, "title") ?? undefined
    });
  }

  return tags;
}

function getAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function normalizeHref(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function countJsonLdScripts(html: string): number {
  return countMatches(html, /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/gi);
}

function countMatches(input: string, pattern: RegExp): number {
  let count = 0;
  while (pattern.exec(input) !== null) count += 1;
  return count;
}

function extractHeadings(html: string, level?: number): string[] {
  const headings: string[] = [];
  const pattern = level
    ? new RegExp(`<h${level}\\b[^>]*>[\\s\\S]*?<\\/h${level}>`, "gi")
    : /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripNonContent(html))) !== null) {
    const text = cleanVisibleText(match[0]);
    if (text) headings.push(text);
  }
  return headings;
}

function tokenizeContent(text: string): string[] {
  const stopwords = new Set([
    "and", "the", "for", "with", "you", "your", "our", "are", "this", "that", "from", "into", "about", "what", "how",
    "как", "что", "для", "это", "или", "если", "под", "над", "про", "при", "мы", "вы", "они", "она", "оно", "его", "ее",
    "нас", "вам", "вас", "уже", "ещё", "еще", "где", "без", "все", "всё", "чем", "чтобы", "когда", "можно", "будет"
  ]);
  const matches = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [];
  return matches.filter((term) => !stopwords.has(term) && !/^\d+$/.test(term));
}

function scoreAgentSurface(surface: Omit<AgentSurface, "readability">): AgentReadabilityScore {
  const checks: Array<{ label: string; points: number; passed: boolean; gap: string }> = [
    {
      label: "canonical",
      points: 15,
      passed: surface.hasCanonical,
      gap: "Missing canonical URL."
    },
    {
      label: "meta-description",
      points: 10,
      passed: surface.hasMetaDescription,
      gap: "Missing meta description."
    },
    {
      label: "single-h1",
      points: 10,
      passed: surface.h1Count === 1,
      gap: surface.h1Count === 0 ? "Missing H1." : `Expected one H1, found ${surface.h1Count}.`
    },
    {
      label: "semantic-main",
      points: 10,
      passed: surface.hasMain,
      gap: "Missing semantic <main> wrapper."
    },
    {
      label: "json-ld",
      points: 20,
      passed: surface.jsonLdCount > 0,
      gap: "Missing JSON-LD structured data."
    },
    {
      label: "markdown-alternate",
      points: 20,
      passed: surface.markdownAlternates.length > 0,
      gap: "Missing text/markdown alternate link."
    },
    {
      label: "llms-discovery",
      points: 15,
      passed: surface.llmsLinks.length > 0,
      gap: "Missing discoverable llms.txt link in HTML head."
    }
  ];
  const score = checks.filter((check) => check.passed).reduce((sum, check) => sum + check.points, 0);
  const maxScore = checks.reduce((sum, check) => sum + check.points, 0);
  const percent = Math.round((score / maxScore) * 100);

  return {
    score,
    maxScore,
    percent,
    grade: gradeForPercent(percent),
    passed: checks.filter((check) => check.passed).map((check) => check.label),
    gaps: checks.filter((check) => !check.passed).map((check) => check.gap)
  };
}

function gradeForPercent(percent: number): AgentReadabilityScore["grade"] {
  if (percent >= 85) return "excellent";
  if (percent >= 70) return "good";
  if (percent >= 50) return "partial";
  return "poor";
}
