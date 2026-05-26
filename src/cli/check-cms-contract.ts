import { readFile } from "node:fs/promises";
import path from "node:path";

interface CmsSurfaceContract {
  contractVersion: number;
  provider: "sanity";
  siteFramework: "astro";
  requiredEnvironment: string[];
  optionalEnvironment: string[];
  defaultApiVersion: string;
  defaultPerspective: string;
  documentTypes: string[];
  requiredFieldGroups: FieldGroup[];
  recommendedAstroOutputs: string[];
}

interface FieldGroup {
  name: string;
  requiredAny: string[];
}

interface CliOptions {
  configPath: string;
  dryRun: boolean;
  requireEnv: boolean;
  limit: number;
  perspective?: string;
}

type RecordValue = Record<string, unknown>;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const contract = JSON.parse(await readFile(options.configPath, "utf8")) as CmsSurfaceContract;

  if (options.dryRun) {
    printSummary(contract, options, "dry-run");
    return;
  }

  const missingEnvVars = contract.requiredEnvironment.filter((name) => !process.env[name]);
  if (missingEnvVars.length > 0) {
    const message = `CMS contract check skipped: missing ${missingEnvVars.join(", ")}.`;
    if (options.requireEnv) throw new Error(message);
    console.log(message);
    printSummary(contract, options, "skipped");
    return;
  }

  const projectId = requiredEnv("SANITY_PROJECT_ID");
  const dataset = requiredEnv("SANITY_DATASET");
  const apiVersion = process.env.SANITY_API_VERSION || contract.defaultApiVersion;
  const perspective = options.perspective || process.env.SANITY_PERSPECTIVE || contract.defaultPerspective;
  const query = buildProbeQuery(contract.documentTypes, options.limit);
  const url = new URL(`https://${projectId}.api.sanity.io/${apiVersionPath(apiVersion)}/data/query/${encodeURIComponent(dataset)}`);
  url.searchParams.set("query", query);
  url.searchParams.set("perspective", perspective);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.SANITY_READ_TOKEN) {
    headers.Authorization = `Bearer ${process.env.SANITY_READ_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Sanity query failed with HTTP ${response.status}: ${JSON.stringify(body).slice(0, 600)}`);
  }

  const result = isRecord(body) ? body.result : undefined;
  if (!Array.isArray(result)) {
    throw new Error("Sanity query did not return an array result.");
  }

  const records = result.filter(isRecord);
  const fieldGroups = contract.requiredFieldGroups.map((group) => {
    const missing = records
      .filter((record) => !hasAnyPath(record, group.requiredAny))
      .map((record) => ({
        id: stringField(record, "_id") || "(missing-id)",
        type: stringField(record, "_type") || "(missing-type)",
        slug: stringField(record, "slug") || stringField(record, "path") || stringField(record, "route") || stringField(record, "url")
      }));

    return {
      name: group.name,
      requiredAny: group.requiredAny,
      passing: records.length - missing.length,
      missing: missing.length,
      missingSamples: missing.slice(0, 8)
    };
  });

  const failedGroups = fieldGroups.filter((group) => group.missing > 0);
  console.log(
    JSON.stringify(
      {
        status: failedGroups.length > 0 ? "needs-review" : "passed",
        provider: contract.provider,
        siteFramework: contract.siteFramework,
        projectId,
        dataset,
        apiVersion,
        perspective,
        checkedDocumentTypes: contract.documentTypes,
        recordCount: records.length,
        fieldGroups,
        recommendedAstroOutputs: contract.recommendedAstroOutputs
      },
      null,
      2
    )
  );

  if (failedGroups.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  let configPath = path.join(process.cwd(), "config", "cms-surface-contract.json");
  let dryRun = false;
  let requireEnv = false;
  let limit = 40;
  let perspective: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--require-env") {
      requireEnv = true;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config requires a path");
      configPath = path.resolve(value);
      index += 1;
    } else if (arg.startsWith("--config=")) {
      configPath = path.resolve(arg.slice("--config=".length));
    } else if (arg === "--limit") {
      const value = args[index + 1];
      if (!value) throw new Error("--limit requires a number");
      limit = parsePositiveInteger(value, "--limit");
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      limit = parsePositiveInteger(arg.slice("--limit=".length), "--limit");
    } else if (arg === "--perspective") {
      const value = args[index + 1];
      if (!value) throw new Error("--perspective requires a value");
      perspective = value;
      index += 1;
    } else if (arg.startsWith("--perspective=")) {
      perspective = arg.slice("--perspective=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { configPath, dryRun, requireEnv, limit, perspective };
}

function buildProbeQuery(documentTypes: string[], limit: number): string {
  const types = JSON.stringify(documentTypes);
  return `*[_type in ${types}][0...${limit}]{
    _id,
    _type,
    _updatedAt,
    title,
    name,
    status,
    state,
    isArchived,
    isWaitlistOpen,
    "slug": slug.current,
    "path": coalesce(path.current, path),
    "route": coalesce(route.current, route),
    url,
    startDate,
    endDate,
    applicationOpenAt,
    applicationCloseAt,
    registrationOpenAt,
    registrationCloseAt,
    cta,
    primaryCta,
    actions,
    links,
    markdown,
    bodyMarkdown,
    agentSummary,
    body,
    content,
    seo
  }`;
}

function printSummary(contract: CmsSurfaceContract, options: CliOptions, status: "dry-run" | "skipped"): void {
  console.log(
    JSON.stringify(
      {
        status,
        config: path.relative(process.cwd(), options.configPath),
        contractVersion: contract.contractVersion,
        provider: contract.provider,
        siteFramework: contract.siteFramework,
        requiredEnvironment: contract.requiredEnvironment,
        optionalEnvironment: contract.optionalEnvironment,
        defaultApiVersion: contract.defaultApiVersion,
        defaultPerspective: contract.defaultPerspective,
        documentTypes: contract.documentTypes,
        requiredFieldGroups: contract.requiredFieldGroups.map((group) => ({
          name: group.name,
          requiredAny: group.requiredAny
        })),
        recommendedAstroOutputs: contract.recommendedAstroOutputs
      },
      null,
      2
    )
  );
}

function hasAnyPath(record: RecordValue, fieldPaths: string[]): boolean {
  return fieldPaths.some((fieldPath) => {
    const value = valueAtPath(record, fieldPath);
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "boolean") return true;
    return value !== undefined && value !== null;
  });
}

function valueAtPath(record: RecordValue, fieldPath: string): unknown {
  return fieldPath.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, record);
}

function stringField(record: RecordValue, fieldPath: string): string | null {
  const value = valueAtPath(record, fieldPath);
  return typeof value === "string" && value.trim() ? value : null;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function apiVersionPath(value: string): string {
  return value.startsWith("v") ? value : `v${value}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
