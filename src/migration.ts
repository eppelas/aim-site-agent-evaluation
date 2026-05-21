import type { Finding, MigrationMapping, MigrationRecord, PageCheck, SiteConfig } from "./types.js";

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

    let status: MigrationRecord["status"];
    if (mapping.decision === "retired") {
      status = "retired";
    } else if (!stagingUrl || mapping.decision === "manual-review") {
      status = "manual-review";
    } else if (!productionCheck?.ok) {
      status = "production-broken";
    } else if (!stagingCheck?.ok) {
      status = "staging-missing";
    } else {
      status = "mapped-ok";
    }

    return {
      ...mapping,
      productionUrl,
      stagingUrl,
      status,
      productionStatus: productionCheck?.status,
      stagingStatus: stagingCheck?.status
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
      severity: record.status === "staging-missing" ? "high" : "medium",
      status: "needs-review",
      title: migrationTitle(record),
      description: `${record.productionPath} migration mapping needs review.`,
      expected: "Every important production route should be mapped, redirected, or intentionally retired before staging replaces production.",
      actual: `${record.status}: ${record.intent}`,
      evidence: { ...record }
    });
  }

  return findings;
}

function migrationTitle(record: MigrationRecord): string {
  if (record.status === "staging-missing") return "Mapped staging route is missing";
  if (record.status === "production-broken") return "Production route in migration map is already broken";
  return "Migration mapping needs manual review";
}

function normalizeUrlForCompare(url: string): string {
  const parsed = new URL(url);
  const pathname = parsed.pathname.replace(/\/$/, "") || "/";
  return `${parsed.origin}${pathname}${parsed.search}`;
}
