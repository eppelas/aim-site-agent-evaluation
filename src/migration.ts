import type { Finding, MigrationMapping, MigrationRecord, MigrationSimilarity, PageCheck, PageTextFingerprint, SiteConfig } from "./types.js";

const contentMismatchThresholdPercent = 18;

export function buildMigrationRecords(
  mappings: MigrationMapping[],
  checks: PageCheck[],
  productionSite: SiteConfig,
  stagingSite: SiteConfig
): MigrationRecord[] {
  return mappings.map((mapping) => {
    const productionUrl = new URL(mapping.productionPath, productionSite.baseUrl).toString();
    const stagingUrl = mapping.stagingPath ? new URL(mapping.stagingPath, stagingSite.baseUrl).toString() : null;
    const productionCheck = checks.find((check) => normalizeUrlForCompare(check.url) === normalizeUrlForCompare(productionUrl));
    const stagingCheck = stagingUrl
      ? checks.find((check) => normalizeUrlForCompare(check.url) === normalizeUrlForCompare(stagingUrl))
      : undefined;

    const contentSimilarity =
      productionCheck?.ok && stagingCheck?.ok ? comparePageContent(productionCheck, stagingCheck) : undefined;

    let status: MigrationRecord["status"];
    if (mapping.decision === "retired") {
      status = "retired";
    } else if (!stagingUrl || mapping.decision === "manual-review") {
      status = "manual-review";
    } else if (!productionCheck?.ok) {
      status = "production-broken";
    } else if (!stagingCheck?.ok) {
      status = "staging-missing";
    } else if (contentSimilarity && contentSimilarity.percent < contentMismatchThresholdPercent) {
      status = "content-mismatch";
    } else {
      status = "mapped-ok";
    }

    return {
      ...mapping,
      productionUrl,
      stagingUrl,
      status,
      productionStatus: productionCheck?.status,
      stagingStatus: stagingCheck?.status,
      contentSimilarity
    };
  });
}

export function migrationFindings(records: MigrationRecord[], startIndex: number): Finding[] {
  const findings: Finding[] = [];
  let index = startIndex;

  for (const record of records) {
    if (record.status === "mapped-ok" || record.status === "retired") continue;

    findings.push({
      id: `finding_${String(index++).padStart(3, "0")}`,
      siteId: "staging",
      url: record.stagingUrl ?? record.productionUrl,
      checkType: "migration-compare",
      severity: record.status === "staging-missing" || record.status === "content-mismatch" ? "high" : "medium",
      status: "needs-review",
      title: migrationTitle(record),
      description: `${record.productionPath} migration mapping needs review.`,
      expected: "Every important production route should be mapped, redirected, or intentionally retired before staging replaces production.",
      actual: `${record.status}: ${record.intent}`,
      remediation: {
        owner: "content",
        summary: record.status === "content-mismatch"
          ? "Review whether the staging page is the correct replacement for the production route or update the migration map."
          : "Resolve this migration mapping before staging replaces production.",
        steps: [
          "Open the production and staging URLs from the evidence.",
          "Compare the page intent, primary heading, top terms, CTA, and current lab/status.",
          "If the mapping is correct despite low similarity, update the migration map decision/intent notes; otherwise map to the correct staging route or mark the production route retired."
        ]
      },
      evidence: { ...record }
    });
  }

  return findings;
}

function migrationTitle(record: MigrationRecord): string {
  if (record.status === "content-mismatch") return "Mapped pages have low content similarity";
  if (record.status === "staging-missing") return "Mapped staging route is missing";
  if (record.status === "production-broken") return "Production route in migration map is already broken";
  return "Migration mapping needs manual review";
}

function normalizeUrlForCompare(url: string): string {
  const parsed = new URL(url);
  const pathname = parsed.pathname.replace(/\/$/, "") || "/";
  return `${parsed.origin}${pathname}${parsed.search}`;
}

function comparePageContent(productionCheck: PageCheck, stagingCheck: PageCheck): MigrationSimilarity {
  const productionFingerprint = productionCheck.textFingerprint;
  const stagingFingerprint = stagingCheck.textFingerprint;
  if (!productionFingerprint || !stagingFingerprint) {
    return unknownSimilarity(productionCheck, stagingCheck);
  }

  const titleSimilarity = jaccard(tokenizeComparable(productionCheck.title ?? ""), tokenizeComparable(stagingCheck.title ?? ""));
  const headingSimilarity = jaccard(normalizedHeadings(productionFingerprint), normalizedHeadings(stagingFingerprint));
  const termSimilarity = jaccard(productionFingerprint.topTerms, stagingFingerprint.topTerms);
  const percent = Math.round((titleSimilarity * 0.15 + headingSimilarity * 0.25 + termSimilarity * 0.6) * 100);
  const sharedTopTerms = productionFingerprint.topTerms.filter((term) => stagingFingerprint.topTerms.includes(term)).slice(0, 20);

  return {
    percent,
    grade: similarityGrade(percent),
    titleSimilarity: Math.round(titleSimilarity * 100),
    headingSimilarity: Math.round(headingSimilarity * 100),
    termSimilarity: Math.round(termSimilarity * 100),
    productionTitle: productionCheck.title,
    stagingTitle: stagingCheck.title,
    productionTopTerms: productionFingerprint.topTerms.slice(0, 20),
    stagingTopTerms: stagingFingerprint.topTerms.slice(0, 20),
    sharedTopTerms,
    productionHeadings: productionFingerprint.headings.slice(0, 8),
    stagingHeadings: stagingFingerprint.headings.slice(0, 8)
  };
}

function unknownSimilarity(productionCheck: PageCheck, stagingCheck: PageCheck): MigrationSimilarity {
  return {
    percent: 0,
    grade: "unknown",
    titleSimilarity: 0,
    headingSimilarity: 0,
    termSimilarity: 0,
    productionTitle: productionCheck.title,
    stagingTitle: stagingCheck.title,
    productionTopTerms: [],
    stagingTopTerms: [],
    sharedTopTerms: [],
    productionHeadings: [],
    stagingHeadings: []
  };
}

function normalizedHeadings(fingerprint: PageTextFingerprint): string[] {
  return fingerprint.headings.flatMap((heading) => tokenizeComparable(heading)).slice(0, 80);
}

function tokenizeComparable(input: string): string[] {
  return input.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [];
}

function jaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 && rightSet.size === 0) return 1;
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let intersection = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) intersection += 1;
  }
  return intersection / new Set([...leftSet, ...rightSet]).size;
}

function similarityGrade(percent: number): MigrationSimilarity["grade"] {
  if (percent >= 45) return "high";
  if (percent >= contentMismatchThresholdPercent) return "medium";
  return "low";
}
