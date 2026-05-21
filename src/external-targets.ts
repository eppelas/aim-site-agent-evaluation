import { fetchWithRedirects } from "./fetcher.js";
import { extractTitle } from "./html.js";
import type { ExternalDateSignal, ExternalTargetCheck, Finding, LinkIntentRecord } from "./types.js";

const contentFreshnessIntents = new Set(["event"]);

export async function checkExternalTargets(
  linkIntents: LinkIntentRecord[],
  now: Date
): Promise<ExternalTargetCheck[]> {
  const targets = groupTargets(linkIntents.filter((record) => contentFreshnessIntents.has(record.intent)));
  const checks: ExternalTargetCheck[] = [];

  for (const target of targets) {
    const result = await fetchWithRedirects(target.targetUrl);
    const dateSignals = result.contentType.includes("text/html") || result.contentType.includes("application/json")
      ? extractDateSignals(result.bodyText)
      : [];
    checks.push({
      siteId: target.siteId,
      targetUrl: target.targetUrl,
      finalUrl: result.finalUrl,
      intent: target.intent,
      sourceUrls: target.sourceUrls,
      status: result.status,
      ok: result.ok,
      contentType: result.contentType,
      title: result.contentType.includes("text/html") ? extractTitle(result.bodyText) : null,
      freshnessStatus: freshnessStatusFor(target.intent, result.ok, dateSignals, now),
      dateSignals,
      redirectChain: result.redirectChain,
      error: result.error
    });
  }

  return checks;
}

export function externalTargetFindings(
  checks: ExternalTargetCheck[],
  now: Date,
  startIndex: number
): Finding[] {
  const findings: Finding[] = [];
  let index = startIndex;

  for (const check of checks) {
    if (!check.ok) {
      findings.push({
        id: `finding_${String(index++).padStart(3, "0")}`,
        siteId: check.siteId,
        url: check.targetUrl,
        checkType: "link-crawl",
        severity: "high",
        status: "failed",
        title: "External target is not reachable",
        description: "A known external CTA target could not be loaded.",
        expected: "CTA targets should be reachable and meaningful.",
        actual: check.error ?? `HTTP ${check.status}`,
        evidence: { externalTargetCheck: check }
      });
    }

    if (check.intent === "event" && check.freshnessStatus === "past") {
      const endSignal = latestSignal(check.dateSignals, ["endDate", "startDate"]);
      findings.push({
        id: `finding_${String(index++).padStart(3, "0")}`,
        siteId: check.siteId,
        url: check.targetUrl,
        checkType: "date-freshness",
        severity: "high",
        status: "failed",
        title: "Linked event is already past",
        description: "The source page links to an event/registration page that is reachable but no longer current.",
        expected: "Active event CTAs should point to upcoming/current events, a waitlist, a recap, or the next cohort.",
        actual: `Event date ${endSignal?.value ?? "unknown"} is before current run date ${now.toISOString()}.`,
        evidence: {
          externalTargetCheck: check,
          sourceUrls: check.sourceUrls,
          dateSignals: check.dateSignals
        }
      });
    }

    if (check.intent === "event" && check.freshnessStatus === "unknown") {
      findings.push({
        id: `finding_${String(index++).padStart(3, "0")}`,
        siteId: check.siteId,
        url: check.targetUrl,
        checkType: "date-freshness",
        severity: "medium",
        status: "needs-review",
        title: "Linked event date could not be verified",
        description: "The event target is reachable, but the checker could not extract a machine-readable event date.",
        expected: "Event targets should expose structured start/end dates or visible dates that can be parsed.",
        actual: "No startDate/endDate signal found.",
        evidence: { externalTargetCheck: check, sourceUrls: check.sourceUrls }
      });
    }
  }

  return findings;
}

function groupTargets(records: LinkIntentRecord[]): Array<{
  siteId: LinkIntentRecord["siteId"];
  targetUrl: string;
  intent: string;
  sourceUrls: string[];
}> {
  const groups = new Map<string, {
    siteId: LinkIntentRecord["siteId"];
    targetUrl: string;
    intent: string;
    sourceUrls: Set<string>;
  }>();

  for (const record of records) {
    const key = `${record.siteId}\u0000${record.intent}\u0000${record.targetUrl}`;
    const existing = groups.get(key);
    if (existing) {
      existing.sourceUrls.add(record.sourceUrl);
    } else {
      groups.set(key, {
        siteId: record.siteId,
        targetUrl: record.targetUrl,
        intent: record.intent,
        sourceUrls: new Set([record.sourceUrl])
      });
    }
  }

  return [...groups.values()].map((group) => ({
    siteId: group.siteId,
    targetUrl: group.targetUrl,
    intent: group.intent,
    sourceUrls: [...group.sourceUrls].sort()
  }));
}

function extractDateSignals(bodyText: string): ExternalDateSignal[] {
  const signals: ExternalDateSignal[] = [];
  const jsonDatePattern = /"(startDate|endDate)"\s*:\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonDatePattern.exec(bodyText)) !== null) {
    const value = decodeJsonString(match[2]);
    const date = new Date(value);
    signals.push({
      label: match[1],
      value,
      source: "json-ld",
      isoValue: Number.isNaN(date.getTime()) ? undefined : date.toISOString()
    });
  }

  return dedupeSignals(signals);
}

function freshnessStatusFor(
  intent: string,
  ok: boolean,
  dateSignals: ExternalDateSignal[],
  now: Date
): ExternalTargetCheck["freshnessStatus"] {
  if (!ok) return "failed";
  if (intent !== "event") return "not-applicable";

  const endSignal = latestSignal(dateSignals, ["endDate", "startDate"]);
  if (!endSignal) return "unknown";

  const endDate = new Date(endSignal.value);
  if (Number.isNaN(endDate.getTime())) return "unknown";
  return endDate.getTime() < now.getTime() ? "past" : "active-or-upcoming";
}

function latestSignal(dateSignals: ExternalDateSignal[], labels: string[]): ExternalDateSignal | undefined {
  const candidates = dateSignals.filter((signal) => labels.includes(signal.label));
  return candidates.sort((a, b) => {
    const aTime = new Date(a.value).getTime();
    const bTime = new Date(b.value).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  })[0];
}

function dedupeSignals(signals: ExternalDateSignal[]): ExternalDateSignal[] {
  const seen = new Set<string>();
  const result: ExternalDateSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.label}\u0000${signal.value}\u0000${signal.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
  }
  return result;
}

function decodeJsonString(input: string): string {
  try {
    return JSON.parse(`"${input.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return input;
  }
}
