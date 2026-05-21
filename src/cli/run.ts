import path from "node:path";
import { loadBrowserMatrix, loadMigrationMap, loadRoutesConfig, loadSites, selectViewports } from "../config.js";
import { discoverRoutes } from "../discovery.js";
import { checkPage, checkSurfaceFiles, findingsFromPageChecks } from "../checks.js";
import { captureScreenshots } from "../screenshots.js";
import { collectLinkIntents, linkIntentFindings } from "../link-intents.js";
import { checkExternalTargets, externalTargetFindings } from "../external-targets.js";
import { buildMigrationRecords, migrationFindings } from "../migration.js";
import { buildSummary, writeReports } from "../report.js";
import type { DiscoveredRoute, RunMode, RunReport, SiteConfig, SiteId } from "../types.js";

interface CliOptions {
  site: "all" | SiteId;
  screenshots: boolean;
  screenshotLimit: number;
  screenshotViewportNames: string[];
  maxCrawlPages: number;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const runId = `${startedAt.toISOString().replace(/[:.]/g, "-")}-${options.site}`;

  const allSites = await loadSites();
  const sites = options.site === "all" ? allSites : allSites.filter((site) => site.id === options.site);
  if (sites.length === 0) {
    throw new Error(`No sites matched "${options.site}"`);
  }

  const allRoutes: DiscoveredRoute[] = [];
  const allChecks = [];
  const allScreenshots = [];

  for (const site of sites) {
    const routesConfig = await loadRoutesConfig(site.id);
    const routes = await discoverRoutes(site, routesConfig, { maxCrawlPages: options.maxCrawlPages });
    allRoutes.push(...routes);

    const routeChecks = [];
    for (const route of routes) {
      routeChecks.push(await checkPage(site, route));
    }

    const surfaceChecks = await checkSurfaceFiles(site);
    allChecks.push(...routeChecks, ...surfaceChecks);

    if (options.screenshots) {
      const matrix = await loadBrowserMatrix();
      const viewports = selectViewports(matrix, options.screenshotViewportNames);
      const screenshotArtifacts = await captureScreenshots(site, routes, {
        viewports,
        limit: options.screenshotLimit,
        outputDir: path.join("artifacts", "latest", "screenshots"),
        baselineDir: path.join("artifacts", "baselines", "screenshots"),
        diffDir: path.join("artifacts", "latest", "diffs")
      });
      allScreenshots.push(...screenshotArtifacts);
    }
  }

  const linkIntents = collectLinkIntents(allChecks);
  const externalTargetChecks = await checkExternalTargets(linkIntents, startedAt);
  const migrationMap = await loadMigrationMap();
  const productionSite = allSites.find((site) => site.id === "production");
  const stagingSite = allSites.find((site) => site.id === "staging");
  const migration =
    productionSite && stagingSite && sites.length > 1 ? buildMigrationRecords(migrationMap, allChecks, productionSite, stagingSite) : [];
  const findings = findingsFromPageChecks(allChecks);
  findings.push(...linkIntentFindings(linkIntents, findings.length + 1));
  findings.push(...externalTargetFindings(externalTargetChecks, startedAt, findings.length + 1));
  findings.push(...migrationFindings(migration, findings.length + 1));
  for (const screenshot of allScreenshots) {
    if (screenshot.status === "failed") {
      findings.push({
        id: `finding_${String(findings.length + 1).padStart(3, "0")}`,
        siteId: screenshot.siteId,
        url: screenshot.url,
        checkType: "screenshot",
        severity: "medium",
        status: "failed",
        title: "Screenshot capture failed",
        description: `Screenshot capture failed for ${screenshot.url} at ${screenshot.viewport.name}.`,
        expected: "Screenshot should be captured for visual review.",
        actual: screenshot.error,
        evidence: { viewport: screenshot.viewport, filePath: screenshot.filePath }
      });
    } else if (screenshot.baselineStatus === "changed") {
      findings.push({
        id: `finding_${String(findings.length + 1).padStart(3, "0")}`,
        siteId: screenshot.siteId,
        url: screenshot.url,
        checkType: "screenshot",
        severity: "medium",
        status: "changed",
        title: "Screenshot differs from baseline",
        description: `Screenshot differs from baseline for ${screenshot.url} at ${screenshot.viewport.name}.`,
        expected: "Current screenshot should remain within the configured visual diff threshold or be reviewed as an intentional change.",
        actual: screenshot.visualDiff
          ? `${(screenshot.visualDiff.mismatchRatio * 100).toFixed(2)}% pixels differ (${screenshot.visualDiff.mismatchPixels} px).`
          : "Current screenshot differs from baseline.",
        evidence: {
          viewport: screenshot.viewport,
          filePath: screenshot.filePath,
          baselinePath: screenshot.baselinePath,
          diffPath: screenshot.diffPath,
          visualDiff: screenshot.visualDiff,
          sha256: screenshot.sha256
        }
      });
    }
  }

  const finishedAt = new Date();
  const summary = buildSummary(findings);
  summary.routesDiscovered = allRoutes.length;
  summary.pagesChecked = allChecks.length;
  summary.screenshotsCaptured = allScreenshots.filter((artifact) => artifact.status === "captured").length;

  const report: RunReport = {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    mode: modeForSites(sites, options.site),
    sites: sites.map((site) => site.id),
    summary,
    checks: allChecks,
    screenshots: allScreenshots,
    linkIntents,
    externalTargetChecks,
    migration,
    findings
  };

  await writeReports(report, path.join("reports", "latest"));

  console.log(`Run complete: ${runId}`);
  console.log(`Sites: ${report.sites.join(", ")}`);
  console.log(`Routes discovered: ${summary.routesDiscovered}`);
  console.log(`Pages checked: ${summary.pagesChecked}`);
  console.log(`Screenshots captured: ${summary.screenshotsCaptured}`);
  console.log(`Findings: ${summary.findingsTotal}`);
  console.log(`Report: reports/latest/summary.md`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    site: "all",
    screenshots: false,
    screenshotLimit: 0,
    screenshotViewportNames: ["mobile", "desktop"],
    maxCrawlPages: 80
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--site" && next) {
      if (next !== "all" && next !== "production" && next !== "staging") {
        throw new Error(`Invalid --site value: ${next}`);
      }
      options.site = next;
      index += 1;
    } else if (arg === "--screenshots") {
      options.screenshots = true;
    } else if (arg === "--screenshot-limit" && next) {
      options.screenshotLimit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--screenshot-viewports" && next) {
      options.screenshotViewportNames = next.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--max-crawl-pages" && next) {
      options.maxCrawlPages = Number.parseInt(next, 10);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function modeForSites(sites: SiteConfig[], selected: "all" | SiteId): RunMode {
  if (selected === "all") return "all-sites";
  return sites[0]?.id === "production" ? "production-regression" : "staging-regression";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
