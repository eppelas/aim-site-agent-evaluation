import type { Finding, LinkIntentRecord, PageCheck } from "./types.js";
import { routeKey } from "./url-utils.js";

export function collectLinkIntents(checks: PageCheck[]): LinkIntentRecord[] {
  const records: LinkIntentRecord[] = [];
  const seen = new Set<string>();

  for (const check of checks) {
    const externalOutgoingLinks = check.outgoingLinks?.filter((link) => !link.isInternal) ?? [];
    for (const link of externalOutgoingLinks) {
      const key = `${check.url}::${routeKey(link.targetUrl)}::${link.text ?? ""}::${link.sourceAnchorUrl ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({
        siteId: check.siteId,
        sourceUrl: check.url,
        targetUrl: link.targetUrl,
        sourceText: link.text,
        sourceSection: link.section,
        sourceAnchorUrl: link.sourceAnchorUrl,
        ...classifyExternalLink(link.targetUrl)
      });
    }
  }

  return records.sort((a, b) => `${a.siteId}:${a.intent}:${a.targetUrl}`.localeCompare(`${b.siteId}:${b.intent}:${b.targetUrl}`));
}

export function linkIntentFindings(linkIntents: LinkIntentRecord[], startIndex: number): Finding[] {
  const findings: Finding[] = [];
  let index = startIndex;
  const unknownBySite = new Map<string, LinkIntentRecord[]>();

  for (const record of linkIntents) {
    if (record.confidence !== "unknown") continue;
    const list = unknownBySite.get(record.siteId) ?? [];
    list.push(record);
    unknownBySite.set(record.siteId, list);
  }

  for (const [siteId, records] of unknownBySite) {
    if (records.length === 0) continue;
    findings.push({
      id: `finding_${String(index++).padStart(3, "0")}`,
      siteId: siteId as Finding["siteId"],
      url: records[0].sourceUrl,
      checkType: "link-crawl",
      severity: "low",
      status: "needs-review",
      title: "Some external links have unknown intent",
      description: "The link inventory found external destinations that are not yet classified by known CTA/content patterns.",
      expected: "External destinations should be classified as Telegram, form, bot, waitlist, docs, YouTube, podcast, social, or related site.",
      actual: `${records.length} unknown external link intents.`,
      evidence: { examples: records.slice(0, 10) }
    });
  }

  return findings;
}

export function classifyExternalLink(targetUrl: string): Pick<LinkIntentRecord, "intent" | "confidence"> {
  const parsed = new URL(targetUrl);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname.toLowerCase();

  if (host === "t.me" || host === "telegram.me") {
    if (path.includes("bot") || parsed.searchParams.has("start")) return { intent: "telegram-bot", confidence: "known" };
    return { intent: "telegram", confidence: "known" };
  }

  if (host.endsWith("bothelp.io")) return { intent: "telegram-bot-routing", confidence: "known" };
  if (host === "tally.so") return { intent: "form", confidence: "known" };
  if (isPaymentHost(host)) return { intent: "payment", confidence: "known" };
  if (host === "docs.google.com") return { intent: "document", confidence: "known" };
  if (host === "youtube.com" || host === "youtu.be") return { intent: "youtube", confidence: "known" };
  if (host.includes("podcast") || host.includes("transistor.fm")) return { intent: "podcast", confidence: "known" };
  if (host.endsWith("notion.site")) return { intent: "knowledge-base", confidence: "known" };
  if (host === "join.aimindset.org") return { intent: "waitlist", confidence: "known" };
  if (host.endsWith("aimindset.org") || host.endsWith("aimindset.ru")) return { intent: "related-site", confidence: "known" };
  if (["instagram.com", "linkedin.com", "github.com", "substack.com"].some((domain) => host.endsWith(domain))) {
    return { intent: "social-or-profile", confidence: "known" };
  }
  if (host.includes("make.com") || host.includes("n8n")) return { intent: "tool-reference", confidence: "probable" };
  if (host.includes("luma.com")) return { intent: "event", confidence: "known" };

  return { intent: "unknown", confidence: "unknown" };
}

function isPaymentHost(host: string): boolean {
  return [
    "buy.stripe.com",
    "checkout.stripe.com",
    "stripe.com",
    "pay.yookassa.ru",
    "yookassa.ru",
    "yoomoney.ru",
    "cloudpayments.ru",
    "pay.cloudpayments.ru",
    "prodamus.ru",
    "securepay.tinkoff.ru",
    "tinkoff.ru",
    "robokassa.ru",
    "uniteller.ru"
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}
