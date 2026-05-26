import path from "node:path";
import { loadBrowserMatrix, loadCtaRules, loadMigrationMap, loadRoutesConfig, loadSites, selectViewports } from "../config.js";
import { discoverRoutes } from "../discovery.js";
import { checkPage, checkSurfaceFiles, findingsFromPageChecks } from "../checks.js";
import { captureScreenshots } from "../screenshots.js";
import { collectLinkIntents, linkIntentFindings } from "../link-intents.js";
import { ctaAssertionFindings } from "../cta-assertions.js";
import { checkExternalTargets, externalTargetFindings } from "../external-targets.js";
import { dateFreshnessFindings } from "../date-freshness.js";
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
      routeChecks.push(await checkPage(site, route, startedAt));
    }

    const surfaceChecks = await checkSurfaceFiles(site, startedAt);
    allChecks.push(...routeChecks, ...surfaceChecks);

    if (options.screenshots) {
      const matrix = await loadBrowserMatrix();
      const viewports = selectViewports(matrix, options.screenshotViewportNames);
      const artifactRunDir = path.join("artifacts", "history", runId);
      const screenshotArtifacts = await captureScreenshots(site, routes, {
        viewports,
        limit: options.screenshotLimit,
        outputDir: path.join(artifactRunDir, "screenshots"),
        baselineDir: path.join("artifacts", "baselines", "screenshots"),
        diffDir: path.join(artifactRunDir, "diffs")
      });
      allScreenshots.push(...screenshotArtifacts);
    }
  }

  const linkIntents = collectLinkIntents(allChecks);
  const ctaRules = await loadCtaRules();
  const externalTargetChecks = await checkExternalTargets(linkIntents, startedAt);
  const migrationMap = await loadMigrationMap();
  const productionSite = allSites.find((site) => site.id === "production");
  const stagingSite = allSites.find((site) => site.id === "staging");
  const migration =
    productionSite && stagingSite && sites.length > 1 ? buildMigrationRecords(migrationMap, allChecks, productionSite, stagingSite) : [];
  const findings = findingsFromPageChecks(allChecks);
  findings.push(...linkIntentFindings(linkIntents, findings.length + 1));
  findings.push(...ctaAssertionFindings(allChecks, ctaRules, findings.length + 1));
  findings.push(...externalTargetFindings(externalTargetChecks, startedAt, findings.length + 1));
  findings.push(...dateFreshnessFindings(allChecks, startedAt, findings.length + 1));
  findings.push(...migrationFindings(migration, findings.length + 1));
  const okPageUrls = new Set(allChecks.filter((check) => check.ok).map((check) => check.url));
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
        remediation: {
          owner: "engineering",
          summary: "Make the page stable enough for Playwright to load and capture.",
          steps: [
            "Open the page in the same viewport and check console/network errors.",
            "Fix navigation, blocking scripts, auth walls, or long-loading resources.",
            "Rerun the screenshot QA and inspect the new artifact."
          ]
        },
        evidence: { viewport: screenshot.viewport, filePath: screenshot.filePath }
      });
    } else if (screenshot.image?.isProbablyBlank) {
      findings.push({
        id: `finding_${String(findings.length + 1).padStart(3, "0")}`,
        siteId: screenshot.siteId,
        url: screenshot.url,
        checkType: "screenshot",
        severity: "high",
        status: "failed",
        title: "Screenshot appears blank",
        description: `Screenshot appears blank for ${screenshot.url} at ${screenshot.viewport.name}.`,
        expected: "Full-page screenshots should contain meaningful rendered content.",
        actual: `${screenshot.image.width}x${screenshot.image.height}, non-white sample ${(screenshot.image.nonWhiteRatio * 100).toFixed(3)}%, dominant color ${(screenshot.image.dominantColorRatio * 100).toFixed(2)}%.`,
        remediation: {
          owner: "engineering",
          summary: "Investigate whether the page rendered blank, failed hydration, or captured before meaningful content appeared.",
          steps: [
            "Open the current screenshot artifact and the live URL in the same viewport.",
            "Check whether content is hidden behind delayed scripts, consent gates, auth, or failed API calls.",
            "Fix rendering or adjust the capture readiness condition only if the live page is actually healthy."
          ]
        },
        evidence: {
          viewport: screenshot.viewport,
          filePath: screenshot.filePath,
          baselinePath: screenshot.baselinePath,
          image: screenshot.image,
          sha256: screenshot.sha256
        }
      });
    } else if (screenshot.image?.largestBlankRegion && okPageUrls.has(screenshot.url)) {
      const region = screenshot.image.largestBlankRegion;
      const retryStatus = screenshot.blankRegionRetry?.status;
      const severe =
        retryStatus === "still-blank-after-scroll" ||
        (!retryStatus && region.height >= Math.max(1000, Math.round(screenshot.viewport.height * 0.9)));
      findings.push({
        id: `finding_${String(findings.length + 1).padStart(3, "0")}`,
        siteId: screenshot.siteId,
        url: screenshot.url,
        checkType: "screenshot",
        severity: severe ? "high" : "medium",
        status: "needs-review",
        title: "Screenshot contains a large blank region",
        description: `Screenshot contains a ${region.height}px mostly empty vertical region for ${screenshot.url} at ${screenshot.viewport.name}.`,
        expected: "Full-page screenshots should not contain large unexpected blank bands where content, embeds, or lazy-loaded sections should appear.",
        actual: `Blank region y=${region.startY}-${region.endY} (${region.height}px), dominant color ${(region.averageDominantColorRatio * 100).toFixed(1)}%, average unique colors ${region.averageUniqueColorCount.toFixed(1)}. Retry: ${retryStatus ?? "not run"}.`,
        remediation: {
          owner: "engineering",
          summary: retryStatus === "resolved-after-scroll"
            ? "The blank band resolved after scroll-settle recapture, so this is likely a lazy-load/readiness issue rather than a permanently missing block."
            : "Review whether a lazy-loaded block, embed, image, or CMS section failed to render in this viewport.",
          steps: [
            "Open the screenshot and inspect the blank y-range from the finding evidence.",
            "Open the scroll-settle retry screenshot if present and compare whether the block appears after scrolling.",
            "Open the live page in the same viewport and scroll through the same region.",
            "If live content eventually appears, adjust loading/readiness or lazy-load behavior; if not, fix the broken block or CMS content."
          ]
        },
        evidence: {
          viewport: screenshot.viewport,
          filePath: screenshot.filePath,
          baselinePath: screenshot.baselinePath,
          retryPath: screenshot.blankRegionRetry?.filePath,
          image: screenshot.image,
          blankRegion: region,
          blankRegionRetry: screenshot.blankRegionRetry,
          sha256: screenshot.sha256
        }
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
        remediation: {
          owner: "qa",
          summary: "Review the visual diff and decide whether this is an intentional content/design change or a regression.",
          steps: [
            "Open the current, baseline, and diff artifacts from the finding card.",
            "If the change is expected, refresh/accept the visual baseline after team review.",
            "If the change is not expected, fix the page layout/content and rerun the screenshot QA."
          ]
        },
        evidence: {
          viewport: screenshot.viewport,
          filePath: screenshot.filePath,
          baselinePath: screenshot.baselinePath,
          diffPath: screenshot.diffPath,
          visualDiff: screenshot.visualDiff,
          image: screenshot.image,
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
  await writeReports(report, path.join("reports", "history", runId));

  console.log(`Run complete: ${runId}`);
  console.log(`Sites: ${report.sites.join(", ")}`);
  console.log(`Routes discovered: ${summary.routesDiscovered}`);
  console.log(`Pages checked: ${summary.pagesChecked}`);
  console.log(`Screenshots captured: ${summary.screenshotsCaptured}`);
  console.log(`Findings: ${summary.findingsTotal}`);
  console.log(`Latest report: reports/latest/summary.md`);
  console.log(`Historical report: reports/history/${runId}/summary.md`);
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
