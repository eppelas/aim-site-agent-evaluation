import type { CtaRule, CtaRulesConfig, Finding, PageCheck, PageOutgoingLink } from "./types.js";
import { classifyExternalLink } from "./link-intents.js";

export function ctaAssertionFindings(checks: PageCheck[], config: CtaRulesConfig, startIndex: number): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  let index = startIndex;

  for (const check of checks) {
    if (!check.ok || !check.contentType.includes("text/html")) continue;

    for (const link of check.outgoingLinks ?? []) {
      const matchedRules = config.rules.filter((rule) => ruleMatchesLink(rule, link));
      for (const rule of matchedRules) {
        const result = evaluateRule(rule, link);
        if (result.ok) continue;

        const key = `${rule.id}:${check.url}:${link.targetUrl}:${link.text ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({
          id: `finding_${String(index++).padStart(3, "0")}`,
          siteId: check.siteId,
          url: check.url,
          checkType: "cta-assertion",
          severity: rule.severity,
          status: "failed",
          title: "CTA destination does not match expected workflow",
          description: "A visible CTA/link looks like one workflow type, but its destination does not match the configured rule.",
          expected: `${rule.description} Expected intents: ${rule.expectedIntents.join(", ")}.`,
          actual: result.reason,
          remediation: {
            owner: rule.owner,
            summary: "Update the CTA destination or adjust the CTA copy so the user workflow matches the visible promise.",
            steps: [
              "Open the source page and find the CTA using the evidence text/section.",
              "If the CTA is correct, update `config/cta-rules.json` to encode the accepted destination.",
              "If the CTA is wrong, replace the href with the expected form, payment, bot, event, or content URL and rerun QA."
            ]
          },
          evidence: {
            rule,
            sourceUrl: check.url,
            targetUrl: link.targetUrl,
            linkText: link.text,
            section: link.section,
            sourceAnchorUrl: link.sourceAnchorUrl,
            references: [
              {
                sourceType: check.source,
                sourceUrl: check.url,
                href: link.rawHref,
                text: link.text,
                section: link.section,
                sourceAnchorUrl: link.sourceAnchorUrl
              }
            ]
          }
        });
      }
    }
  }

  return findings;
}

function ruleMatchesLink(rule: CtaRule, link: PageOutgoingLink): boolean {
  const haystack = (link.text ?? "").toLowerCase();
  if (!haystack) return false;

  return rule.matchText.some((pattern) => {
    try {
      return new RegExp(pattern, "iu").test(haystack);
    } catch {
      return haystack.includes(pattern.toLowerCase());
    }
  });
}

function evaluateRule(rule: CtaRule, link: PageOutgoingLink): { ok: true } | { ok: false; reason: string } {
  const parsed = new URL(link.targetUrl);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const targetIntent = link.isInternal ? "internal-page" : classifyExternalLink(link.targetUrl).intent;

  if (rule.requireHttps && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: `Rule ${rule.id} requires HTTPS, but target uses ${parsed.protocol}: ${link.targetUrl}`
    };
  }

  if (rule.allowedHosts && rule.allowedHosts.length > 0 && !rule.allowedHosts.some((allowedHost) => hostMatches(host, allowedHost))) {
    return {
      ok: false,
      reason: `Rule ${rule.id} expected one of hosts ${rule.allowedHosts.join(", ")}, but target host is ${host} (${link.targetUrl}).`
    };
  }

  if (!rule.expectedIntents.includes(targetIntent)) {
    return {
      ok: false,
      reason: `Rule ${rule.id} expected intent ${rule.expectedIntents.join(", ")}, but target was classified as ${targetIntent} (${link.targetUrl}).`
    };
  }

  return { ok: true };
}

function hostMatches(actualHost: string, allowedHost: string): boolean {
  const normalizedAllowed = allowedHost.replace(/^www\./, "").toLowerCase();
  return actualHost === normalizedAllowed || actualHost.endsWith(`.${normalizedAllowed}`);
}
