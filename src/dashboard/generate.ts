import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PNG } from "pngjs";
import type { Finding, LinkReference, RunReport, ScreenshotArtifact, SiteConfig, SiteId } from "../types.js";

const latestReportPath = path.join(process.cwd(), "reports", "latest", "report.json");
const latestOutputDir = path.join(process.cwd(), "reports", "latest");
const historyRootDir = path.join(process.cwd(), "reports", "history");
const sitesConfigPath = path.join(process.cwd(), "config", "sites.json");
const historyStorageConfigPath = path.join(process.cwd(), "config", "history-storage.json");
let renderOutputDir = latestOutputDir;
let evidenceCropIndex = new Map<string, string>();
let evidenceFocusIndex = new Map<string, EvidenceFocus>();

interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EvidenceFocus {
  kind: "blank" | "overlap" | "manual";
  label: string;
  detail?: string;
  xPercent: number;
  yPercent: number;
  crop?: CropBounds;
}

async function main(): Promise<void> {
  const report = JSON.parse(await readFile(latestReportPath, "utf8")) as RunReport;
  await writeDashboardSet(report, latestOutputDir);

  await writeHistoryDashboardSets();
  const historyReports = await writeHistoryIndex();
  await writeStorageManifests(report, historyReports);

  console.log(`Dashboard written: ${path.relative(process.cwd(), path.join(latestOutputDir, "dashboard.html"))}`);
}

async function writeHistoryDashboardSets(): Promise<void> {
  const historyReports = await loadHistoryReports();
  for (const report of historyReports) {
    await writeDashboardSet(report, path.join(historyRootDir, safePathSegment(report.runId)));
  }
}

async function writeDashboardSet(report: RunReport, targetOutputDir: string): Promise<void> {
  renderOutputDir = targetOutputDir;
  await mkdir(targetOutputDir, { recursive: true });
  evidenceCropIndex = await writeEvidenceCrops(report, targetOutputDir);
  const dashboardSiteIds = await siteIdsForDashboardSet(report, targetOutputDir);
  await writeFile(path.join(targetOutputDir, "dashboard.html"), renderDashboardIndex(report, dashboardSiteIds), "utf8");
  for (const siteId of dashboardSiteIds) {
    await writeFile(path.join(targetOutputDir, `dashboard.${siteId}.html`), renderDashboard(report, siteId), "utf8");
  }
}

async function writeEvidenceCrops(report: RunReport, targetOutputDir: string): Promise<Map<string, string>> {
  const cropIndex = new Map<string, string>();
  const focusIndex = new Map<string, EvidenceFocus>();
  const cropDir = path.join(targetOutputDir, "evidence-crops");
  const screenshotByFilePath = new Map(report.screenshots.map((screenshot) => [screenshot.filePath, screenshot]));

  for (const finding of report.findings) {
    const filePath = stringEvidence(finding, "filePath");
    const screenshot = filePath ? screenshotByFilePath.get(filePath) : undefined;
    const focus = findingEvidenceFocus(finding, screenshot);
    if (focus) focusIndex.set(finding.id, focus);
    if (!filePath || !focus?.crop) continue;

    try {
      const sourcePath = path.join(process.cwd(), filePath);
      const cropId = createHash("sha256")
        .update(`${finding.id}:${filePath}:${JSON.stringify(focus.crop)}`)
        .digest("hex")
        .slice(0, 12);
      const cropPath = path.join(cropDir, `${safePathSegment(finding.id)}-${cropId}.png`);
      await mkdir(cropDir, { recursive: true });
      await writePngCrop(sourcePath, cropPath, focus.crop);
      cropIndex.set(finding.id, toPosix(path.relative(process.cwd(), cropPath)));
    } catch {
      // Evidence crops are a dashboard affordance; the original screenshot link remains canonical.
    }
  }

  evidenceFocusIndex = focusIndex;
  return cropIndex;
}

async function writePngCrop(sourcePath: string, cropPath: string, crop: CropBounds): Promise<void> {
  const source = PNG.sync.read(await readFile(sourcePath));
  const x = clampInteger(crop.x, 0, Math.max(0, source.width - 1));
  const y = clampInteger(crop.y, 0, Math.max(0, source.height - 1));
  const width = clampInteger(crop.width, 1, source.width - x);
  const height = clampInteger(crop.height, 1, source.height - y);
  const output = new PNG({ width, height });

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const sourceIndex = ((source.width * (y + row)) + (x + col)) << 2;
      const outputIndex = ((width * row) + col) << 2;
      output.data[outputIndex] = source.data[sourceIndex];
      output.data[outputIndex + 1] = source.data[sourceIndex + 1];
      output.data[outputIndex + 2] = source.data[sourceIndex + 2];
      output.data[outputIndex + 3] = source.data[sourceIndex + 3];
    }
  }

  await writeFile(cropPath, PNG.sync.write(output));
}

function findingEvidenceFocus(finding: Finding, screenshot?: ScreenshotArtifact): EvidenceFocus | undefined {
  const evidence = finding.evidence ?? {};
  const image = asRecord(evidence.image) ?? asRecord(screenshot?.image);
  const width = numberValue(image?.width);
  const height = numberValue(image?.height);
  const blankRegion = asRecord(image?.largestBlankRegion);
  if (width && height && blankRegion) {
    const startY = numberValue(blankRegion.startY) ?? 0;
    const endY = numberValue(blankRegion.endY) ?? startY;
    const regionHeight = numberValue(blankRegion.height) ?? Math.max(1, endY - startY + 1);
    const centerY = startY + regionHeight / 2;
    const padding = Math.round(Math.min(260, Math.max(90, regionHeight * 0.18)));
    const cropY = clampInteger(startY - padding, 0, Math.max(0, height - 1));
    const cropHeight = clampInteger(regionHeight + padding * 2, 160, height - cropY);
    return {
      kind: "blank",
      label: "Problem crop: blank region",
      detail: `blank band y=${Math.round(startY)}-${Math.round(endY)} / ${Math.round(regionHeight)}px`,
      xPercent: 50,
      yPercent: percent(centerY, height),
      crop: { x: 0, y: cropY, width, height: cropHeight }
    };
  }

  const overlap = firstOverlap(evidence);
  if (width && height && overlap) {
    const intersection = asRecord(overlap.intersection);
    const fixedRect = asRecord(overlap.fixedRect);
    const referenceRect = intersection ?? fixedRect;
    const left = numberValue(referenceRect?.left ?? referenceRect?.x) ?? 0;
    const top = numberValue(referenceRect?.top ?? referenceRect?.y) ?? 0;
    const right = numberValue(referenceRect?.right) ?? left + (numberValue(referenceRect?.width) ?? 1);
    const bottom = numberValue(referenceRect?.bottom) ?? top + (numberValue(referenceRect?.height) ?? 1);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const cropLeft = clampInteger(left - 420, 0, Math.max(0, width - 1));
    const cropTop = clampInteger(top - 90, 0, Math.max(0, height - 1));
    const cropRight = clampInteger(Math.max(right + 80, cropLeft + 420), cropLeft + 1, width);
    const cropBottom = clampInteger(Math.max(bottom + 90, cropTop + 260), cropTop + 1, height);
    const stateName = typeof overlap.stateName === "string" ? overlap.stateName : undefined;
    const fixedSelector = typeof overlap.fixedSelector === "string" ? overlap.fixedSelector : undefined;
    return {
      kind: "overlap",
      label: "Problem crop: sticky overlap",
      detail: [stateName, fixedSelector].filter(Boolean).join(" / ") || "fixed/sticky element overlap",
      xPercent: percent(centerX, width),
      yPercent: percent(centerY, height),
      crop: { x: cropLeft, y: cropTop, width: cropRight - cropLeft, height: cropBottom - cropTop }
    };
  }

  const manualContext = typeof evidence.manualContext === "string" ? evidence.manualContext : "";
  if (width && height && manualContext) {
    const cropWidth = Math.min(width, 760);
    const cropHeight = Math.min(height, 520);
    const cropX = clampInteger(width - cropWidth - 20, 0, Math.max(0, width - cropWidth));
    const cropY = clampInteger(Math.round(height * 0.18), 0, Math.max(0, height - cropHeight));
    return {
      kind: "manual",
      label: "Problem crop: manual evidence area",
      detail: manualContext,
      xPercent: 70,
      yPercent: 45,
      crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
    };
  }

  return undefined;
}

function firstOverlap(evidence: Record<string, unknown>): Record<string, unknown> | undefined {
  const overlaps = Array.isArray(evidence.overlaps)
    ? evidence.overlaps
    : Array.isArray(evidence.stickyOverlaps)
      ? evidence.stickyOverlaps
      : undefined;
  return overlaps?.map(asRecord).find((record): record is Record<string, unknown> => Boolean(record));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function percent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 50;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function clampInteger(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function renderDashboardIndex(report: RunReport, dashboardSiteIds: SiteId[]): string {
  const runDate = new Date(report.startedAt);
  const siteCards = dashboardSiteIds
    .map((siteId) => {
      const checkedInRun = report.sites.includes(siteId);
      const siteReport = scopeReport(report, siteId);
      const summaryText = checkedInRun
        ? `${siteReport.summary.findingsTotal} findings / ${siteReport.summary.high} high`
        : "not checked in this run";
      return `<a class="site-card ${checkedInRun ? "" : "not-run"}" href="dashboard.${escapeAttribute(siteId)}.html">
        <span class="eyebrow">${escapeHtml(siteId)}</span>
        <strong>${escapeHtml(siteTitle(siteId))}</strong>
        <span>${escapeHtml(summaryText)}</span>
      </a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Mindset QA Dashboards</title>
  <style>${css()}</style>
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">AI Mindset Site Agent Evaluation</p>
      <h1>QA Dashboards</h1>
    </div>
    <div class="run-meta">
      <a href="${escapeAttribute(historyIndexHref())}">History</a>
      ${isHistoryOutput() ? `<a href="${escapeAttribute(latestDashboardHref())}">Latest</a>` : ""}
      <span>${escapeHtml(report.mode)}</span>
      <span>${escapeHtml(report.runId)}</span>
    </div>
  </header>
  <main>
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Separate Workspaces</p>
          <h2>Choose Site Dashboard</h2>
        </div>
      </div>
      <div class="site-grid">${siteCards}</div>
    </section>
    ${renderHistoryPreview()}
    <section class="grid stats">
      ${statCard("Routes", String(report.summary.routesDiscovered), "Discovered pages and configured surfaces")}
      ${statCard("Pages", String(report.summary.pagesChecked), "HTTP and surface checks")}
      ${statCard("Screenshots", String(report.summary.screenshotsCaptured), "Captured visual evidence artifacts")}
      ${statCard("Findings", String(report.summary.findingsTotal), severityLine(report))}
    </section>
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Calendar</p>
          <h2>Checks Timeline</h2>
        </div>
      </div>
      <div class="calendar">
        ${calendarCard("Last run", runDate, statusForReport(report), `${report.summary.findingsTotal} findings`, "run-status")}
        ${calendarCard("Next biweekly", nextIsoWeekday(runDate, 1, 14), "planned", "Production + staging + AI Native smoke")}
        ${calendarCard("Next monthly", new Date(Date.UTC(runDate.getUTCFullYear(), runDate.getUTCMonth() + 1, 1, 8, 0, 0)), "planned", "Expanded viewports and screenshots")}
      </div>
    </section>
    ${renderRunStatusPanel(report, undefined)}
  </main>
</body>
</html>
`;
}

function renderDashboard(report: RunReport, siteId: SiteId): string {
  const scopedReport = scopeReport(report, siteId);
  const checkedInRun = report.sites.includes(siteId);
  const runDate = new Date(report.startedAt);
  const nextBiweekly = nextIsoWeekday(runDate, 1, 14);
  const nextMonthly = new Date(Date.UTC(runDate.getUTCFullYear(), runDate.getUTCMonth() + 1, 1, 8, 0, 0));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Mindset QA Dashboard</title>
  <style>${css()}</style>
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">AI Mindset Site Agent Evaluation</p>
      <h1>${escapeHtml(siteTitle(siteId))}</h1>
    </div>
    <div class="run-meta">
      <a href="dashboard.html">All dashboards</a>
      <a href="${escapeAttribute(historyIndexHref())}">History</a>
      ${isHistoryOutput() ? `<a href="${escapeAttribute(latestDashboardHref())}">Latest</a>` : ""}
      <span>${escapeHtml(scopedReport.mode)}</span>
      <span>${escapeHtml(report.runId)}</span>
    </div>
  </header>

  <main>
    <section class="grid stats">
      ${statCard("Routes", String(scopedReport.summary.routesDiscovered), "Discovered pages and configured surfaces")}
      ${statCard("Pages", String(scopedReport.summary.pagesChecked), "HTTP and surface checks")}
      ${statCard("Screenshots", String(scopedReport.summary.screenshotsCaptured), "Captured visual evidence artifacts")}
      ${statCard("Findings", String(scopedReport.summary.findingsTotal), severityLine(scopedReport))}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Calendar</p>
          <h2>Checks Timeline</h2>
        </div>
      </div>
      <div class="calendar">
        ${calendarCard("Last run", runDate, statusForReport(scopedReport), `${scopedReport.summary.findingsTotal} findings`, "run-status")}
        ${calendarCard("Next biweekly", nextBiweekly, "planned", `${siteTitle(siteId)} smoke`)}
        ${calendarCard("Next monthly", nextMonthly, "planned", "Expanded viewports and screenshots")}
      </div>
    </section>

    ${checkedInRun ? renderRunStatusPanel(scopedReport, siteId) : renderSiteNotCheckedPanel(report, siteId)}

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Findings</p>
          <h2>Current Issues</h2>
        </div>
      </div>
      ${renderFindings(scopedReport.findings)}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Evidence</p>
          <h2>Screenshot Gallery</h2>
        </div>
      </div>
      ${renderScreenshots(scopedReport.screenshots)}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Outbound Links</p>
          <h2>Link Intent Inventory</h2>
        </div>
      </div>
      ${renderLinkIntents(scopedReport)}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">External Freshness</p>
          <h2>External Target Checks</h2>
        </div>
      </div>
      ${renderExternalTargets(scopedReport)}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Agents</p>
          <h2>Agent Readability</h2>
        </div>
      </div>
      ${renderAgentReadability(scopedReport)}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Freshness</p>
          <h2>Date Token Inventory</h2>
        </div>
      </div>
      ${renderDateTokens(scopedReport)}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Migration</p>
          <h2>Production to Staging Map</h2>
        </div>
      </div>
      ${renderMigration(scopedReport)}
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Coverage</p>
          <h2>Checked Pages</h2>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Site</th><th>Status</th><th>Source</th><th>URL</th></tr>
          </thead>
          <tbody>
            ${scopedReport.checks
              .map(
                (check) => `<tr>
                  <td>${escapeHtml(check.siteId)}</td>
                  <td><span class="pill ${check.ok ? "ok" : "fail"}">${check.status}</span></td>
                  <td>${escapeHtml(check.source)}</td>
                  <td><a href="${escapeAttribute(check.url)}">${escapeHtml(check.url)}</a></td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function renderSiteNotCheckedPanel(report: RunReport, siteId: SiteId): string {
  const checkedSites = report.sites.length > 0 ? report.sites.join(", ") : "none";
  return `<section class="panel run-status" id="run-status">
    <div class="section-head">
      <div>
        <p class="eyebrow">Run Status</p>
        <h2>${escapeHtml(siteTitle(siteId))} Was Not Checked In This Run</h2>
      </div>
      <span class="pill warning">not checked</span>
    </div>
    <div class="rerun-box">
      <p>The latest run <code>${escapeHtml(report.runId)}</code> checked ${escapeHtml(checkedSites)} only. This dashboard shell is kept visible so single-site runs do not hide the production or staging workspaces.</p>
      <p>Local rerun command:</p>
      <pre><code>${escapeHtml(`npm run qa -- --site ${siteId} --max-crawl-pages 80 && npm run dashboard`)}</code></pre>
      <p>GitHub Actions rerun after this repo is pushed and GitHub CLI is authenticated:</p>
      <pre><code>${escapeHtml("gh workflow run site-qa.yml -f mode=health")}</code></pre>
    </div>
  </section>`;
}

function renderHistoryPreview(): string {
  if (isHistoryOutput()) return "";
  return `<section class="panel compact-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">History</p>
        <h2>Previous Runs</h2>
      </div>
      <a href="${escapeAttribute(historyIndexHref())}">Open history</a>
    </div>
    <p class="empty">Each QA run is archived under <code>reports/history/&lt;runId&gt;</code>. Screenshot artifacts for future screenshot runs are archived under <code>artifacts/history/&lt;runId&gt;</code>.</p>
  </section>`;
}

function statCard(label: string, value: string, note: string): string {
  return `<article class="stat-card"><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div><p>${escapeHtml(note)}</p></article>`;
}

function severityLine(report: RunReport): string {
  return `Critical ${report.summary.critical} / High ${report.summary.high} / Medium ${report.summary.medium}`;
}

function calendarCard(title: string, date: Date, status: string, note: string, detailsAnchor?: string): string {
  const pill = `<span class="pill ${escapeAttribute(status)}">${escapeHtml(status)}</span>`;
  return `<article class="calendar-card ${escapeAttribute(status)}">
    <div class="date">${date.toISOString().slice(0, 10)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(note)}</p>
    ${detailsAnchor ? `<a class="status-link" href="#${escapeAttribute(detailsAnchor)}">${pill}<span>View reason and rerun options</span></a>` : pill}
  </article>`;
}

function renderRunStatusPanel(report: RunReport, siteId: SiteId | undefined): string {
  const status = statusForReport(report);
  const topFindings = [...report.findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 8);
  const bySeverity = groupCount(report.findings, (finding) => finding.severity);
  const byType = groupCount(report.findings, (finding) => finding.checkType);
  const mode = siteId ? `--site ${siteId}` : "--site all";
  const localCommand = report.summary.screenshotsCaptured > 0
    ? siteId === "ai-native"
      ? "npm run qa:ai-native && npm run dashboard"
      : siteId
      ? `npm run qa -- ${mode} --screenshots --screenshot-viewports mobile,tablet,desktop,hd --screenshot-limit 0 --max-crawl-pages 120 && npm run dashboard`
      : "npm run qa:monthly && npm run dashboard"
    : `npm run qa -- ${mode} --max-crawl-pages 80 && npm run dashboard`;
  const workflowMode = report.summary.screenshotsCaptured > 0 ? "monthly" : "health";
  const githubCommand = `gh workflow run site-qa.yml -f mode=${workflowMode}`;

  return `<section class="panel run-status" id="run-status">
    <div class="section-head">
      <div>
        <p class="eyebrow">Run Status</p>
        <h2>Why This Run Is ${escapeHtml(status.toUpperCase())}</h2>
      </div>
      <span class="pill ${escapeAttribute(status)}">${escapeHtml(status)}</span>
    </div>
    <div class="run-status-grid">
      <article class="run-status-card">
        <h3>Reason</h3>
        <p>${escapeHtml(runReason(report))}</p>
      </article>
      <article class="run-status-card">
        <h3>By Severity</h3>
        ${renderCountList(bySeverity)}
      </article>
      <article class="run-status-card">
        <h3>By Check Type</h3>
        ${renderCountList(byType)}
      </article>
    </div>
    <div class="rerun-box">
      <h3>Rerun</h3>
      <p>Local rerun command:</p>
      <pre><code>${escapeHtml(localCommand)}</code></pre>
      <p>GitHub Actions rerun after this repo is pushed and GitHub CLI is authenticated:</p>
      <pre><code>${escapeHtml(githubCommand)}</code></pre>
      <div class="asset-links">
        <a href="summary.md">Open summary</a>
        <a href="report.json">Open raw report</a>
        <a href="#findings">Jump to findings</a>
      </div>
    </div>
    ${topFindings.length > 0 ? `<div class="top-findings"><h3>Top Findings</h3>${topFindings.map((finding) => `<a href="#${escapeAttribute(finding.id)}"><span class="pill ${escapeAttribute(finding.severity)}">${escapeHtml(finding.severity)}</span>${escapeHtml(finding.title)}<small>${escapeHtml(finding.checkType)} / ${escapeHtml(shortenUrl(finding.url))}</small></a>`).join("")}</div>` : ""}
  </section>`;
}

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return `<p class="empty">No findings in this run.</p>`;
  }

  const groups = groupBy(findings, (finding) => finding.severity);
  const order = ["critical", "high", "medium", "low", "info"];

  return `<div class="findings-board">
    ${order
      .filter((severity) => groups.has(severity))
      .map((severity) => {
        const items = groups.get(severity) ?? [];
        return `<section class="finding-column">
          <h3>${severity.toUpperCase()} <span>${items.length}</span></h3>
          ${items
            .map(
              (finding) => `<article class="finding-card ${escapeAttribute(finding.severity)}" id="${escapeAttribute(finding.id)}">
                <p class="finding-type">${escapeHtml(finding.siteId)} / ${escapeHtml(finding.checkType)}</p>
                <h4>${escapeHtml(finding.title)}</h4>
                <p>${escapeHtml(finding.actual ?? finding.description)}</p>
                <a href="${escapeAttribute(finding.url)}">${escapeHtml(finding.url)}</a>
                ${renderFindingEvidenceAssets(finding)}
                ${renderFindingRemediation(finding)}
                ${renderFindingReferences(finding)}
              </article>`
            )
            .join("")}
        </section>`;
      })
      .join("")}
  </div>`;
}

function renderFindingRemediation(finding: Finding): string {
  if (!finding.remediation) return "";

  return `<div class="remediation-box">
    <strong>Recommended fix <span>${escapeHtml(finding.remediation.owner)}</span></strong>
    <p>${escapeHtml(finding.remediation.summary)}</p>
    <ol>
      ${finding.remediation.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
    </ol>
  </div>`;
}

function renderFindingEvidenceAssets(finding: Finding): string {
  const diffPath = stringEvidence(finding, "diffPath");
  const filePath = stringEvidence(finding, "filePath");
  const baselinePath = stringEvidence(finding, "baselinePath");
  const retryPath = stringEvidence(finding, "retryPath");
  const currentPath = filePath ? toReportRelativePath(filePath) : undefined;
  const cropPath = evidenceCropIndex.get(finding.id);
  const cropReportPath = cropPath ? toReportRelativePath(cropPath) : undefined;
  const previewPath = cropReportPath ?? currentPath;
  const galleryAnchor = filePath ? artifactAnchor(filePath) : undefined;
  const focus = evidenceFocusIndex.get(finding.id) ?? findingEvidenceFocus(finding);
  const evidenceLabel = screenshotEvidenceLabel(finding);
  const links = [
    cropPath ? ["Problem crop", cropPath] : undefined,
    filePath ? ["Open exact screenshot", filePath] : undefined,
    galleryAnchor ? ["Gallery card", `#${galleryAnchor}`] : undefined,
    diffPath ? ["Diff", diffPath] : undefined,
    retryPath ? ["Scroll retry", retryPath] : undefined,
    baselinePath ? ["Baseline", baselinePath] : undefined
  ].filter((item): item is [string, string] => Boolean(item));

  if (links.length === 0) return "";

  return `${previewPath ? `<a class="evidence-preview ${focus ? `focus-${escapeAttribute(focus.kind)}` : ""}" href="${escapeAttribute(currentPath ?? previewPath)}" style="${evidenceFocusStyle(focus)}">
    <span class="evidence-preview-frame">
      <img src="${escapeAttribute(previewPath)}" alt="${escapeAttribute(focus?.label ?? evidenceLabel)}" loading="lazy" />
    </span>
    <span class="evidence-preview-copy">
      <strong>${escapeHtml(focus?.label ?? "Evidence preview")}</strong>
      <span>${escapeHtml(focus?.detail ?? evidenceLabel)}</span>
      <em>${escapeHtml(evidenceLabel)}</em>
    </span>
  </a>` : ""}
  <div class="asset-links">
    ${links.map(([label, target]) => `<a href="${escapeAttribute(target.startsWith("#") ? target : toReportRelativePath(target))}">${escapeHtml(label)}</a>`).join("")}
  </div>`;
}

function evidenceFocusStyle(focus: EvidenceFocus | undefined): string {
  if (!focus) return "";
  return `--evidence-focus-x:${focus.xPercent.toFixed(2)}%; --evidence-focus-y:${focus.yPercent.toFixed(2)}%;`;
}

function screenshotEvidenceLabel(finding: Finding): string {
  const evidence = finding.evidence ?? {};
  const browserEngine = typeof evidence.browserEngine === "string" ? evidence.browserEngine : undefined;
  const viewport = evidence.viewport && typeof evidence.viewport === "object" ? evidence.viewport as { name?: unknown } : undefined;
  const state = evidence.state && typeof evidence.state === "object" ? evidence.state as { name?: unknown } : undefined;
  const parts = [
    browserEngine,
    typeof viewport?.name === "string" ? viewport.name : undefined,
    typeof state?.name === "string" ? state.name : undefined
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" / ") : "Evidence screenshot";
}

function renderFindingReferences(finding: Finding): string {
  const references = findingReferences(finding);
  const sourceUrls = findingSourceUrls(finding);
  if (references.length === 0 && sourceUrls.length === 0) return "";

  return `<div class="finding-sources">
    <strong>Found in</strong>
    ${references
      .slice(0, 6)
      .map((reference) => {
        const sourceHref = reference.sourceAnchorUrl ?? reference.sourceUrl;
        const sourceLink = isHttpUrl(sourceHref)
          ? `<a href="${escapeAttribute(sourceHref)}">${escapeHtml(shortenUrl(sourceHref))}</a>`
          : `<span>${escapeHtml(sourceHref)}</span>`;
        const details = [
          reference.sourceType,
          reference.section ? `section: ${reference.section}` : "",
          reference.text ? `text: ${reference.text}` : "",
          reference.href ? `href: ${reference.href}` : ""
        ].filter(Boolean);
        return `<div class="source-row">
          ${sourceLink}
          <small>${escapeHtml(details.join(" / "))}</small>
        </div>`;
      })
      .join("")}
    ${references.length > 6 ? `<small>${references.length - 6} more source references in report.json</small>` : ""}
    ${references.length === 0 ? sourceUrls.map((sourceUrl) => `<div class="source-row"><a href="${escapeAttribute(sourceUrl)}">${escapeHtml(shortenUrl(sourceUrl))}</a><small>source page using this external target</small></div>`).join("") : ""}
  </div>`;
}

function renderScreenshots(screenshots: ScreenshotArtifact[]): string {
  const captured = screenshots.filter((screenshot) => screenshot.status === "captured");
  if (captured.length === 0) {
    return `<p class="empty">No screenshots captured in this run.</p>`;
  }

  const suspiciousCount = captured.filter(isSuspiciousScreenshot).length;
  const changedCount = captured.filter((screenshot) => screenshot.baselineStatus === "changed").length;
  const blankCount = captured.filter((screenshot) => Boolean(screenshot.image?.isProbablyBlank || screenshot.image?.largestBlankRegion)).length;
  const overlapCount = captured.filter((screenshot) => (screenshot.stickyOverlaps?.length ?? 0) > 0).length;
  const sorted = [...captured].sort((a, b) => Number(isSuspiciousScreenshot(b)) - Number(isSuspiciousScreenshot(a)));

  const summary = `<div class="gallery-summary">
    <span><strong>${captured.length}</strong> screenshots</span>
    <span><strong>${suspiciousCount}</strong> suspicious</span>
    <span><strong>${changedCount}</strong> changed</span>
    <span><strong>${blankCount}</strong> blank-band</span>
    <span><strong>${overlapCount}</strong> overlap candidates</span>
  </div>`;

  return `${summary}<div class="gallery">
    ${sorted
      .map((screenshot) => {
        const relativePath = toPosix(path.relative(renderOutputDir, path.join(process.cwd(), screenshot.filePath)));
        return `<figure id="${escapeAttribute(artifactAnchor(screenshot.filePath))}" class="${escapeAttribute(screenshotReviewClass(screenshot))}">
          <a class="screenshot-frame" href="${escapeAttribute(relativePath)}"><img src="${escapeAttribute(relativePath)}" alt="${escapeAttribute(screenshot.url)} at ${escapeAttribute(screenshot.viewport.name)}" loading="lazy" /></a>
          <figcaption>
            <strong>${escapeHtml(screenshot.siteId)} / ${escapeHtml(screenshot.browserEngine ?? "browser")} / ${escapeHtml(screenshot.viewport.name)}</strong>
            <span>${escapeHtml(screenshot.captureKind ?? "full-page")}${screenshot.state ? ` / ${escapeHtml(screenshot.state.name)}` : ""}</span>
            <span><span class="pill ${baselinePillClass(screenshot.baselineStatus)}">${escapeHtml(screenshot.baselineStatus ?? "not-checked")}</span></span>
            ${screenshot.visualDiff ? `<span>${(screenshot.visualDiff.mismatchRatio * 100).toFixed(2)}% diff / ${screenshot.visualDiff.mismatchPixels} px</span>` : ""}
            ${screenshot.image ? `<span>${screenshot.image.width}x${screenshot.image.height} / ${screenshot.image.isProbablyBlank ? "possible blank" : "content detected"}</span>` : ""}
            ${screenshot.image?.largestBlankRegion ? `<span>${screenshot.image.largestBlankRegion.height}px blank band at y=${screenshot.image.largestBlankRegion.startY}</span>` : ""}
            ${screenshot.blankRegionRetry ? `<span>scroll retry: ${escapeHtml(screenshot.blankRegionRetry.status)}</span>` : ""}
            ${screenshot.stickyOverlaps?.length ? `<span>${screenshot.stickyOverlaps.length} fixed/sticky overlap candidate(s)</span>` : ""}
            <span>${escapeHtml(screenshot.url)}</span>
            ${screenshot.byteSize ? `<span>${Math.round(screenshot.byteSize / 1024)} KB</span>` : ""}
            ${screenshot.baselineStatus === "changed" && screenshot.diffPath ? `<a href="${escapeAttribute(toReportRelativePath(screenshot.diffPath))}">Open diff</a>` : ""}
          </figcaption>
        </figure>`;
      })
      .join("")}
  </div>`;
}

function screenshotReviewClass(screenshot: ScreenshotArtifact): string {
  const classes = ["screenshot-card"];
  if (isSuspiciousScreenshot(screenshot)) classes.push("suspicious");
  if (screenshot.baselineStatus === "changed") classes.push("changed");
  if (screenshot.image?.isProbablyBlank || screenshot.image?.largestBlankRegion) classes.push("blank");
  if ((screenshot.stickyOverlaps?.length ?? 0) > 0) classes.push("overlap");
  return classes.join(" ");
}

function artifactAnchor(filePath: string): string {
  return `shot-${createHash("sha1").update(filePath).digest("hex").slice(0, 12)}`;
}

function isSuspiciousScreenshot(screenshot: ScreenshotArtifact): boolean {
  return Boolean(
    screenshot.baselineStatus === "changed" ||
      screenshot.image?.isProbablyBlank ||
      screenshot.image?.largestBlankRegion ||
      screenshot.blankRegionRetry ||
      (screenshot.stickyOverlaps?.length ?? 0) > 0
  );
}

function renderLinkIntents(report: RunReport): string {
  if (report.linkIntents.length === 0) {
    return `<p class="empty">No external links found in this run.</p>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr><th>Site</th><th>Intent</th><th>Confidence</th><th>Target</th><th>Source</th><th>Link text / section</th></tr>
      </thead>
      <tbody>
        ${report.linkIntents
          .map(
            (record) => `<tr>
              <td>${escapeHtml(record.siteId)}</td>
              <td>${escapeHtml(record.intent)}</td>
              <td><span class="pill ${record.confidence === "unknown" ? "warning" : "ok"}">${escapeHtml(record.confidence)}</span></td>
              <td><a href="${escapeAttribute(record.targetUrl)}">${escapeHtml(record.targetUrl)}</a></td>
              <td><a href="${escapeAttribute(record.sourceAnchorUrl ?? record.sourceUrl)}">${escapeHtml(record.sourceAnchorUrl ? shortenUrl(record.sourceAnchorUrl) : record.sourceUrl)}</a></td>
              <td>${[record.sourceText, record.sourceSection ? `section: ${record.sourceSection}` : ""].filter((value): value is string => Boolean(value)).map((value) => `<span class="token">${escapeHtml(value)}</span>`).join(" ") || "not captured"}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderExternalTargets(report: RunReport): string {
  if (report.externalTargetChecks.length === 0) {
    return `<p class="empty">No external targets required content freshness checks in this run.</p>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr><th>Site</th><th>Intent</th><th>Status</th><th>Date signals</th><th>Target</th><th>Used from</th></tr>
      </thead>
      <tbody>
        ${report.externalTargetChecks
          .map(
            (check) => `<tr>
              <td>${escapeHtml(check.siteId)}</td>
              <td>${escapeHtml(check.intent)}</td>
              <td><span class="pill ${check.freshnessStatus === "past" || check.freshnessStatus === "failed" ? "fail" : check.freshnessStatus === "unknown" ? "warning" : "ok"}">${escapeHtml(check.freshnessStatus)}</span></td>
              <td>${check.dateSignals.length > 0 ? check.dateSignals.map((signal) => `<span class="token">${escapeHtml(`${signal.label}: ${signal.value}`)}</span>`).join(" ") : "not found"}</td>
              <td><a href="${escapeAttribute(check.targetUrl)}">${escapeHtml(check.title ?? check.targetUrl)}</a></td>
              <td>${check.sourceUrls.map((sourceUrl) => `<a href="${escapeAttribute(sourceUrl)}">${escapeHtml(shortenUrl(sourceUrl))}</a>`).join("<br>")}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderAgentReadability(report: RunReport): string {
  const pages = report.checks.filter((check) => check.ok && check.contentType.includes("text/html") && check.agentSurface);
  if (pages.length === 0) {
    return `<p class="empty">No HTML agent-readability surfaces checked in this run.</p>`;
  }

  const sortedPages = [...pages].sort((a, b) => {
    const aScore = a.agentSurface?.readability.percent ?? 0;
    const bScore = b.agentSurface?.readability.percent ?? 0;
    return aScore - bScore || a.url.localeCompare(b.url);
  });

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr><th>Score</th><th>Grade</th><th>URL</th><th>Passed</th><th>Gaps</th><th>Agent files</th></tr>
      </thead>
      <tbody>
        ${sortedPages
          .map((check) => {
            const readability = check.agentSurface?.readability;
            const percent = readability?.percent ?? 0;
            return `<tr>
              <td>
                <div class="score-cell">
                  <strong>${percent}/100</strong>
                  <span class="score-track"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></span>
                </div>
              </td>
              <td><span class="pill ${readabilityPillClass(readability?.grade)}">${escapeHtml(readability?.grade ?? "unknown")}</span></td>
              <td><a href="${escapeAttribute(check.url)}">${escapeHtml(shortenUrl(check.url))}</a></td>
              <td>${(readability?.passed ?? []).map((item) => `<span class="token">${escapeHtml(item)}</span>`).join(" ") || "none"}</td>
              <td>${(readability?.gaps ?? []).map((item) => `<span class="token gap">${escapeHtml(item)}</span>`).join(" ") || "none"}</td>
              <td>
                ${check.agentSurface?.markdownAlternates.map((href) => `<a href="${escapeAttribute(href)}">md</a>`).join(" ") || ""}
                ${check.agentSurface?.llmsLinks.map((href) => `<a href="${escapeAttribute(href)}">llms</a>`).join(" ") || ""}
                ${check.agentSurface?.jsonLdCount ? `<span class="token">json-ld ${check.agentSurface.jsonLdCount}</span>` : ""}
                ${renderMarkdownMirrorPills(check.markdownMirrors)}
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderMarkdownMirrorPills(mirrors: RunReport["checks"][number]["markdownMirrors"] | undefined): string {
  if (!mirrors || mirrors.length === 0) return "";
  return mirrors
    .map((mirror) => `<a class="token ${mirror.status === "matched" ? "" : "gap"}" href="${escapeAttribute(mirror.url)}">mirror ${escapeHtml(mirror.status)} ${mirror.similarityPercent}/100</a>`)
    .join(" ");
}

function renderMigration(report: RunReport): string {
  if (report.migration.length === 0) {
    return `<p class="empty">No migration map evaluated in this run.</p>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr><th>Status</th><th>Decision</th><th>Similarity</th><th>Intent</th><th>Production</th><th>Staging</th><th>Shared terms</th></tr>
      </thead>
      <tbody>
        ${report.migration
          .map(
            (record) => `<tr>
              <td><span class="pill ${record.status === "mapped-ok" ? "ok" : record.status === "content-mismatch" ? "fail" : "warning"}">${escapeHtml(record.status)}</span></td>
              <td>${escapeHtml(record.decision)}</td>
              <td>${record.contentSimilarity ? `<strong>${record.contentSimilarity.percent}/100</strong><br><span class="pill ${record.contentSimilarity.grade === "high" ? "ok" : record.contentSimilarity.grade === "medium" ? "warning" : "fail"}">${escapeHtml(record.contentSimilarity.grade)}</span>` : "not checked"}</td>
              <td>${escapeHtml(record.intent)}</td>
              <td><a href="${escapeAttribute(record.productionUrl)}">${escapeHtml(record.productionPath)} (${record.productionStatus ?? "not checked"})</a></td>
              <td>${
                record.stagingUrl
                  ? `<a href="${escapeAttribute(record.stagingUrl)}">${escapeHtml(record.stagingPath ?? "")} (${record.stagingStatus ?? "not checked"})</a>`
                  : "manual decision needed"
              }</td>
              <td>${record.contentSimilarity?.sharedTopTerms.slice(0, 10).map((term) => `<span class="token">${escapeHtml(term)}</span>`).join(" ") || "none"}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderDateTokens(report: RunReport): string {
  const pages = report.checks.filter((check) => check.dateTokens.length > 0 || (check.dateSignals?.length ?? 0) > 0);
  if (pages.length === 0) {
    return `<p class="empty">No visible date tokens extracted in this run.</p>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr><th>Site</th><th>URL</th><th>Normalized signals</th><th>Extracted date tokens</th></tr>
      </thead>
      <tbody>
        ${pages
          .map(
            (check) => `<tr>
              <td>${escapeHtml(check.siteId)}</td>
              <td><a href="${escapeAttribute(check.url)}">${escapeHtml(check.url)}</a></td>
              <td>${
                (check.dateSignals?.length ?? 0) > 0
                  ? check.dateSignals.map((signal) => `<div class="date-signal"><span class="pill ${signal.status === "past" && signal.category !== "archive" && signal.category !== "generic" ? "fail" : signal.status === "upcoming" || signal.status === "today" ? "ok" : "warning"}">${escapeHtml(signal.status)}</span><strong>${escapeHtml(signal.raw)}${signal.normalizedDate ? ` -> ${escapeHtml(signal.normalizedDate)}` : ""}</strong><small>${escapeHtml(`${signal.category} / ${signal.confidence}${signal.assumedYear ? " / year assumed" : ""}`)}</small><small>${escapeHtml(signal.context)}</small></div>`).join("")
                  : "not parsed"
              }</td>
              <td>${check.dateTokens.map((token) => `<span class="token">${escapeHtml(token)}</span>`).join(" ")}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

async function writeHistoryIndex(): Promise<RunReport[]> {
  const reports = await loadHistoryReports();
  renderOutputDir = historyRootDir;
  await mkdir(historyRootDir, { recursive: true });
  await writeFile(path.join(historyRootDir, "index.html"), renderHistoryIndex(reports), "utf8");
  await writeFile(path.join(historyRootDir, "index.json"), `${JSON.stringify(buildHistoryIndexJson(reports), null, 2)}\n`, "utf8");
  return reports;
}

async function loadHistoryReports(): Promise<RunReport[]> {
  try {
    const entries = await readdir(historyRootDir, { withFileTypes: true });
    const reports = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return JSON.parse(await readFile(path.join(historyRootDir, entry.name, "report.json"), "utf8")) as RunReport;
          } catch {
            return undefined;
          }
        })
    );

    return reports
      .filter((report): report is RunReport => Boolean(report))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  } catch {
    return [];
  }
}

function renderHistoryIndex(reports: RunReport[]): string {
  const latest = reports[0];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Mindset QA History</title>
  <style>${css()}</style>
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">AI Mindset Site Agent Evaluation</p>
      <h1>Run History</h1>
    </div>
    <div class="run-meta">
      <a href="../latest/dashboard.html">Latest dashboard</a>
      ${latest ? `<span>${escapeHtml(latest.runId)}</span>` : ""}
    </div>
  </header>
  <main>
    <section class="grid stats">
      ${statCard("Runs", String(reports.length), "Archived report snapshots")}
      ${statCard("Latest Findings", latest ? String(latest.summary.findingsTotal) : "0", latest ? severityLine(latest) : "No reports yet")}
      ${statCard("Latest Screenshots", latest ? String(latest.summary.screenshotsCaptured) : "0", "Archived per run when screenshots are enabled")}
      ${statCard("Latest Status", latest ? statusForReport(latest).toUpperCase() : "EMPTY", latest ? latest.startedAt : "No history")}
    </section>
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Archive</p>
          <h2>Runs</h2>
        </div>
        <div class="asset-links">
          <a href="index.json">Open history JSON</a>
          <a href="storage-manifest.json">Open storage manifest</a>
        </div>
      </div>
      ${reports.length === 0 ? `<p class="empty">No archived runs yet.</p>` : `<div class="history-list">
        ${reports.map((report) => `<article class="history-card ${escapeAttribute(statusForReport(report))}">
          <div>
            <span class="pill ${escapeAttribute(statusForReport(report))}">${escapeHtml(statusForReport(report))}</span>
            <h3>${escapeHtml(report.startedAt.slice(0, 10))}</h3>
            <p>${escapeHtml(report.mode)} / ${escapeHtml(report.sites.join(", "))}</p>
            <small>${escapeHtml(report.runId)}</small>
          </div>
          <div class="history-metrics">
            <span>${report.summary.findingsTotal} findings</span>
            <span>${report.summary.high} high</span>
            <span>${report.summary.screenshotsCaptured} screenshots</span>
          </div>
          <div class="asset-links">
            <a href="${escapeAttribute(safePathSegment(report.runId))}/dashboard.html">Dashboard</a>
            ${report.sites.map((siteId) => `<a href="${escapeAttribute(safePathSegment(report.runId))}/dashboard.${escapeAttribute(siteId)}.html">${escapeHtml(siteId)}</a>`).join("")}
            <a href="${escapeAttribute(safePathSegment(report.runId))}/report.json">JSON</a>
            <a href="${escapeAttribute(safePathSegment(report.runId))}/summary.md">Summary</a>
          </div>
        </article>`).join("")}
      </div>`}
    </section>
  </main>
</body>
</html>
`;
}

function buildHistoryIndexJson(reports: RunReport[]): unknown {
  return {
    generatedAt: new Date().toISOString(),
    runCount: reports.length,
    latestRunId: reports[0]?.runId ?? null,
    runs: reports.map((report) => ({
      runId: report.runId,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      mode: report.mode,
      sites: report.sites,
      status: statusForReport(report),
      summary: report.summary,
      paths: {
        dashboard: `reports/history/${safePathSegment(report.runId)}/dashboard.html`,
        reportJson: `reports/history/${safePathSegment(report.runId)}/report.json`,
        summary: `reports/history/${safePathSegment(report.runId)}/summary.md`,
        siteDashboards: Object.fromEntries(report.sites.map((siteId) => [siteId, `reports/history/${safePathSegment(report.runId)}/dashboard.${siteId}.html`]))
      }
    }))
  };
}

async function writeStorageManifests(latestReport: RunReport, historyReports: RunReport[]): Promise<void> {
  const storageConfig = await loadHistoryStorageConfig();
  const latestManifest = await buildStorageManifest([latestReport], "latest-run", storageConfig);
  await writeFile(path.join(latestOutputDir, "storage-manifest.json"), `${JSON.stringify(latestManifest, null, 2)}\n`, "utf8");

  const historyManifest = await buildStorageManifest(historyReports, "history", storageConfig);
  await writeFile(path.join(historyRootDir, "storage-manifest.json"), `${JSON.stringify(historyManifest, null, 2)}\n`, "utf8");
}

async function buildStorageManifest(reports: RunReport[], scope: "latest-run" | "history", storageConfig: HistoryStorageConfig): Promise<StorageManifest> {
  const candidates = new Map<string, StorageManifestCandidate>();
  const add = (relativePath: string, kind: StorageManifestCandidate["kind"], runId?: string) => {
    const normalizedPath = normalizeRelativePath(relativePath);
    candidates.set(normalizedPath, { relativePath: normalizedPath, kind, runId });
  };

  if (scope === "latest-run") {
    const latestDashboardSites = await siteIdsForDashboardSet(reports[0], latestOutputDir);
    add("reports/latest/report.json", "report-json", reports[0]?.runId);
    add("reports/latest/summary.md", "report-summary", reports[0]?.runId);
    add("reports/latest/dashboard.html", "report-dashboard", reports[0]?.runId);
    for (const siteId of latestDashboardSites) add(`reports/latest/dashboard.${siteId}.html`, "report-dashboard", reports[0]?.runId);
    add("reports/history/index.html", "history-index");
    add("reports/history/index.json", "history-index-json");
  }

  if (scope === "history") {
    add("reports/history/index.html", "history-index");
    add("reports/history/index.json", "history-index-json");
    add("reports/latest/storage-manifest.json", "storage-manifest");
  }

  for (const report of reports) {
    const runPath = `reports/history/${safePathSegment(report.runId)}`;
    add(`${runPath}/report.json`, "report-json", report.runId);
    add(`${runPath}/summary.md`, "report-summary", report.runId);
    add(`${runPath}/dashboard.html`, "report-dashboard", report.runId);
    for (const siteId of report.sites) add(`${runPath}/dashboard.${siteId}.html`, "report-dashboard", report.runId);

    for (const screenshot of report.screenshots) {
      add(screenshot.filePath, "screenshot", report.runId);
      if (screenshot.diffPath) add(screenshot.diffPath, "visual-diff", report.runId);
      if (screenshot.blankRegionRetry?.filePath) add(screenshot.blankRegionRetry.filePath, "scroll-retry-screenshot", report.runId);
    }
  }

  const files = (await Promise.all([...candidates.values()].map((candidate) => describeManifestFile(candidate, storageConfig))))
    .filter((file): file is StorageManifestFile => Boolean(file))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    generatedAt: new Date().toISOString(),
    manifestVersion: storageConfig.manifestVersion,
    scope,
    storage: {
      currentLocalStorage: storageConfig.currentLocalStorage,
      durableStorageStatus: storageConfig.durableStorageStatus,
      recommendedProvider: storageConfig.recommendedProvider,
      baseKey: storageConfig.baseKey,
      retention: storageConfig.retention,
      futureEnvVars: storageConfig.futureEnvVars,
      notes: storageConfig.notes
    },
    runCount: reports.length,
    runIds: reports.map((report) => report.runId),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0),
    files
  };
}

interface StorageManifestCandidate {
  relativePath: string;
  kind: "report-json" | "report-summary" | "report-dashboard" | "history-index" | "history-index-json" | "storage-manifest" | "screenshot" | "visual-diff" | "scroll-retry-screenshot";
  runId?: string;
}

interface StorageManifestFile extends StorageManifestCandidate {
  byteSize: number;
  sha256: string;
  destinationKey: string;
}

interface StorageManifest {
  generatedAt: string;
  manifestVersion: number;
  scope: "latest-run" | "history";
  storage: {
    currentLocalStorage: string;
    durableStorageStatus: string;
    recommendedProvider: string;
    baseKey: string;
    retention: Record<string, string>;
    futureEnvVars: string[];
    notes: string[];
  };
  runCount: number;
  runIds: string[];
  fileCount: number;
  totalBytes: number;
  files: StorageManifestFile[];
}

interface HistoryStorageConfig {
  manifestVersion: number;
  recommendedProvider: string;
  baseKey: string;
  currentLocalStorage: string;
  durableStorageStatus: string;
  retention: Record<string, string>;
  futureEnvVars: string[];
  notes: string[];
}

const defaultHistoryStorageConfig: HistoryStorageConfig = {
  manifestVersion: 1,
  recommendedProvider: "cloudflare-r2-s3-compatible",
  baseKey: "aim-site-agent-evaluation",
  currentLocalStorage: "GitHub Pages + GitHub Actions artifacts",
  durableStorageStatus: "planned",
  retention: {
    reports: "24 months",
    screenshots: "12 months",
    visualDiffs: "12 months",
    baselines: "manual review before pruning"
  },
  futureEnvVars: [
    "QA_HISTORY_S3_ENDPOINT",
    "QA_HISTORY_S3_BUCKET",
    "QA_HISTORY_S3_ACCESS_KEY_ID",
    "QA_HISTORY_S3_SECRET_ACCESS_KEY",
    "QA_HISTORY_S3_REGION"
  ],
  notes: ["Manifest generation is local only until an external sync adapter is implemented."]
};

async function loadHistoryStorageConfig(): Promise<HistoryStorageConfig> {
  try {
    const parsed = JSON.parse(await readFile(historyStorageConfigPath, "utf8")) as Partial<HistoryStorageConfig>;
    return {
      ...defaultHistoryStorageConfig,
      ...parsed,
      retention: {
        ...defaultHistoryStorageConfig.retention,
        ...(parsed.retention ?? {})
      },
      futureEnvVars: Array.isArray(parsed.futureEnvVars) ? parsed.futureEnvVars : defaultHistoryStorageConfig.futureEnvVars,
      notes: Array.isArray(parsed.notes) ? parsed.notes : defaultHistoryStorageConfig.notes
    };
  } catch {
    return defaultHistoryStorageConfig;
  }
}

async function describeManifestFile(candidate: StorageManifestCandidate, storageConfig: HistoryStorageConfig): Promise<StorageManifestFile | undefined> {
  try {
    const absolutePath = path.join(process.cwd(), candidate.relativePath);
    const [stats, bytes] = await Promise.all([stat(absolutePath), readFile(absolutePath)]);
    return {
      ...candidate,
      byteSize: stats.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      destinationKey: joinDestinationKey(storageConfig.baseKey, candidate.relativePath)
    };
  } catch {
    return undefined;
  }
}

function joinDestinationKey(baseKey: string, relativePath: string): string {
  return `${baseKey.replace(/\/+$/g, "")}/${normalizeRelativePath(relativePath).replace(/^\/+/g, "")}`;
}

function normalizeRelativePath(input: string): string {
  const relativePath = path.isAbsolute(input) ? path.relative(process.cwd(), input) : input;
  return toPosix(path.normalize(relativePath)).replace(/^\.\//, "");
}

async function siteIdsForDashboardSet(report: RunReport | undefined, targetOutputDir: string): Promise<SiteId[]> {
  if (!report) return [];
  if (!isLatestOutputDir(targetOutputDir)) return report.sites;

  const configuredSiteIds = await readConfiguredSiteIds();
  return uniqueSiteIds([...configuredSiteIds, ...report.sites]);
}

async function readConfiguredSiteIds(): Promise<SiteId[]> {
  try {
    const parsed = JSON.parse(await readFile(sitesConfigPath, "utf8")) as { sites?: Array<Partial<SiteConfig>> };
    return uniqueSiteIds((parsed.sites ?? []).map((site) => site.id).filter((siteId): siteId is SiteId => isSiteId(siteId)));
  } catch {
    return [];
  }
}

function uniqueSiteIds(siteIds: SiteId[]): SiteId[] {
  return [...new Set(siteIds)];
}

function isSiteId(input: unknown): input is SiteId {
  return input === "production" || input === "staging" || input === "ai-native";
}

function isLatestOutputDir(outputDir: string): boolean {
  return path.resolve(outputDir) === path.resolve(latestOutputDir);
}

function scopeReport(report: RunReport, siteId: SiteId): RunReport {
  const findings = report.findings.filter((finding) => finding.siteId === siteId);
  const checks = report.checks.filter((check) => check.siteId === siteId);
  const screenshots = report.screenshots.filter((screenshot) => screenshot.siteId === siteId);
  const linkIntents = report.linkIntents.filter((record) => record.siteId === siteId);
  const externalTargetChecks = report.externalTargetChecks.filter((check) => check.siteId === siteId);
  const migration = report.migration.filter((record) => record.productionUrl.includes(siteHost(siteId)) || record.stagingUrl?.includes(siteHost(siteId)));
  const summary = {
    routesDiscovered: new Set(checks.filter((check) => check.source !== "surface").map((check) => check.url)).size,
    pagesChecked: checks.length,
    screenshotsCaptured: screenshots.filter((screenshot) => screenshot.status === "captured").length,
    findingsTotal: findings.length,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
    info: findings.filter((finding) => finding.severity === "info").length
  };

  return {
    ...report,
    mode: siteId === "production" ? "production-regression" : siteId === "ai-native" ? "ai-native-visual-qa" : "staging-regression",
    sites: [siteId],
    summary,
    checks,
    screenshots,
    linkIntents,
    externalTargetChecks,
    migration,
    findings
  };
}

function findingReferences(finding: Finding): LinkReference[] {
  const references = finding.evidence?.references;
  if (!Array.isArray(references)) return [];

  return references
    .filter((reference): reference is LinkReference => {
      if (!reference || typeof reference !== "object") return false;
      const value = reference as Partial<LinkReference>;
      return typeof value.sourceType === "string" && typeof value.sourceUrl === "string" && typeof value.href === "string";
    })
    .sort((a, b) => sourceRank(a.sourceType) - sourceRank(b.sourceType));
}

function findingSourceUrls(finding: Finding): string[] {
  const directSources = finding.evidence?.sourceUrls;
  if (Array.isArray(directSources)) {
    return directSources.filter((sourceUrl): sourceUrl is string => typeof sourceUrl === "string").sort();
  }

  const externalTargetCheck = finding.evidence?.externalTargetCheck;
  if (externalTargetCheck && typeof externalTargetCheck === "object") {
    const sourceUrls = (externalTargetCheck as { sourceUrls?: unknown }).sourceUrls;
    if (Array.isArray(sourceUrls)) {
      return sourceUrls.filter((sourceUrl): sourceUrl is string => typeof sourceUrl === "string").sort();
    }
  }

  return [];
}

function stringEvidence(finding: Finding, key: string): string | undefined {
  const value = finding.evidence?.[key];
  return typeof value === "string" ? value : undefined;
}

function toReportRelativePath(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return toPosix(path.relative(renderOutputDir, path.join(process.cwd(), input)));
}

function sourceRank(sourceType: LinkReference["sourceType"]): number {
  if (sourceType === "crawl") return 0;
  if (sourceType === "sitemap") return 1;
  if (sourceType === "seed") return 2;
  return 3;
}

function siteTitle(siteId: SiteId): string {
  if (siteId === "production") return "aimindset.org";
  if (siteId === "ai-native") return "ai-native.aimindset.org";
  return "staging.aimindset.org";
}

function siteHost(siteId: SiteId): string {
  return siteTitle(siteId);
}

function baselinePillClass(status: ScreenshotArtifact["baselineStatus"]): string {
  if (status === "matched") return "ok";
  if (status === "changed") return "fail";
  if (status === "baseline-created") return "warning";
  return "warning";
}

function isHistoryOutput(): boolean {
  return path.basename(path.dirname(renderOutputDir)) === "history";
}

function historyIndexHref(): string {
  return isHistoryOutput() ? "../index.html" : "../history/index.html";
}

function latestDashboardHref(): string {
  return isHistoryOutput() ? "../../latest/dashboard.html" : "dashboard.html";
}

function safePathSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "run";
}

function readabilityPillClass(grade: string | undefined): string {
  if (grade === "excellent" || grade === "good") return "ok";
  if (grade === "partial") return "warning";
  return "fail";
}

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function shortenUrl(input: string): string {
  if (!isHttpUrl(input)) return input;
  const url = new URL(input);
  const pathAndHash = `${url.pathname}${url.search}${url.hash}`;
  return `${url.hostname}${pathAndHash === "/" ? "" : pathAndHash}`;
}

function statusForReport(report: RunReport): string {
  if (report.summary.critical > 0 || report.summary.high > 0) return "failed";
  if (report.summary.medium > 0 || report.summary.low > 0) return "warning";
  return "passed";
}

function runReason(report: RunReport): string {
  if (report.summary.critical > 0) {
    return `${report.summary.critical} critical finding(s) were found. Critical findings mean the run failed and should be reviewed before release.`;
  }
  if (report.summary.high > 0) {
    return `${report.summary.high} high-severity finding(s) were found. High findings currently make the run failed.`;
  }
  if (report.summary.medium > 0 || report.summary.low > 0) {
    return `${report.summary.medium + report.summary.low} non-blocking finding(s) were found. Review them and decide whether to accept or fix.`;
  }
  return "No findings were found in this run.";
}

function severityRank(severity: Finding["severity"]): number {
  const ranks: Record<Finding["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4
  };
  return ranks[severity];
}

function groupCount<T>(items: T[], getKey: (item: T) => string): Array<{ key: string; count: number }> {
  return [...groupBy(items, getKey)]
    .map(([key, group]) => ({ key, count: group.length }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function renderCountList(items: Array<{ key: string; count: number }>): string {
  if (items.length === 0) return `<p class="empty">None</p>`;
  return `<div class="count-list">${items.map((item) => `<div><span>${escapeHtml(item.key)}</span><strong>${item.count}</strong></div>`).join("")}</div>`;
}

function nextIsoWeekday(from: Date, weekday: number, intervalDays: number): Date {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 7, 0, 0));
  const currentWeekday = next.getUTCDay() || 7;
  const delta = (weekday - currentWeekday + 7) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + delta);
  while (next.getTime() - from.getTime() < intervalDays * 24 * 60 * 60 * 1000) {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  return next;
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function toPosix(input: string): string {
  return input.split(path.sep).join("/");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input);
}

function css(): string {
  return `
    :root {
      color-scheme: light;
      --bg: #f7f7f2;
      --panel: #ffffff;
      --ink: #171717;
      --muted: #6f716d;
      --line: #e4e2da;
      --ok: #1f8a4c;
      --warn: #a86b00;
      --fail: #b42318;
      --info: #315d9b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .topbar {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      padding: 32px 40px;
      border-bottom: 1px solid var(--line);
      background: #fbfbf8;
    }
    h1, h2, h3, h4, p { margin: 0; }
    h1 { font-size: clamp(32px, 5vw, 64px); letter-spacing: 0; line-height: 0.95; }
    h2 { font-size: 26px; }
    .eyebrow {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .run-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-end;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      word-break: break-all;
    }
    main { width: min(1440px, 100%); margin: 0 auto; padding: 28px 24px 56px; }
    .grid { display: grid; gap: 16px; }
    .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 16px; }
    .stat-card, .panel, .calendar-card, .finding-card, figure {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .stat-card { padding: 18px; min-height: 132px; }
    .stat-value { font-size: 40px; font-weight: 800; line-height: 1; }
    .stat-label { margin-top: 10px; font-weight: 700; }
    .stat-card p, .calendar-card p, .finding-card p, figcaption span { color: var(--muted); font-size: 13px; margin-top: 8px; }
    .panel { padding: 22px; margin-top: 16px; }
    .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .calendar { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .calendar-card { padding: 16px; }
    .calendar-card .date { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .status-link { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 12px; color: inherit; text-decoration: none; }
    .status-link .pill { margin-top: 0; }
    .status-link span:last-child { color: var(--muted); font-size: 12px; }
    .run-status-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 14px; }
    .run-status-card, .rerun-box {
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .run-status-card h3, .rerun-box h3, .top-findings h3 { font-size: 15px; margin-bottom: 8px; }
    .run-status-card p, .rerun-box p { color: var(--muted); font-size: 13px; margin-top: 6px; }
    .count-list { display: flex; flex-direction: column; gap: 8px; }
    .count-list div { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 13px; }
    .count-list strong { color: var(--ink); }
    .rerun-box { margin-top: 14px; }
    pre {
      margin: 8px 0 12px;
      padding: 12px;
      border-radius: 8px;
      background: #1f201d;
      color: #f8f7ef;
      overflow-x: auto;
      font-size: 12px;
    }
    .top-findings { margin-top: 14px; display: grid; gap: 8px; }
    .top-findings a {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 10px;
      align-items: center;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      text-decoration: none;
      color: var(--ink);
    }
    .top-findings small { grid-column: 2; color: var(--muted); }
    .compact-panel code { padding: 2px 5px; border-radius: 4px; background: #f1efe8; }
    .history-list { display: grid; gap: 12px; }
    .history-card {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(180px, 0.6fr) minmax(220px, 0.8fr);
      gap: 16px;
      align-items: center;
      padding: 14px;
      border: 1px solid var(--line);
      border-left-width: 5px;
      border-radius: 8px;
      background: #fff;
    }
    .history-card.failed { border-left-color: var(--fail); }
    .history-card.warning, .history-card.planned { border-left-color: var(--warn); }
    .history-card.passed { border-left-color: var(--ok); }
    .history-card h3 { margin-top: 8px; font-size: 22px; }
    .history-card p, .history-card small { color: var(--muted); overflow-wrap: anywhere; }
    .history-metrics { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 13px; }
    .site-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .site-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 132px;
      padding: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      color: inherit;
      text-decoration: none;
    }
    .site-card.not-run {
      background: #fbfaf5;
      border-style: dashed;
    }
    .site-card strong { font-size: 28px; line-height: 1.05; }
    .site-card span:last-child { color: var(--muted); font-size: 13px; }
    .pill { display: inline-flex; margin-top: 12px; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; border: 1px solid currentColor; }
    .pill.ok, .pill.passed { color: var(--ok); }
    .pill.warning, .pill.planned { color: var(--warn); }
    .pill.fail, .pill.failed, .pill.critical, .pill.high { color: var(--fail); }
    .token { display: inline-flex; margin: 2px; padding: 3px 7px; border-radius: 999px; background: #f1efe8; color: #3b3b37; font-size: 12px; }
    .token.gap { background: #fff3e0; color: #6c4a00; }
    .score-cell { display: grid; gap: 6px; min-width: 100px; }
    .score-track { display: block; width: 100%; height: 8px; border-radius: 999px; background: #eceae1; overflow: hidden; }
    .score-track span { display: block; height: 100%; border-radius: inherit; background: #315d9b; }
    .date-signal {
      display: grid;
      gap: 4px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
      max-width: 680px;
    }
    .date-signal:last-child { border-bottom: 0; }
    .date-signal .pill { width: fit-content; margin-top: 0; }
    .date-signal small { color: var(--muted); overflow-wrap: anywhere; }
    .findings-board { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; align-items: start; }
    .finding-column h3 { font-size: 13px; letter-spacing: 0.08em; margin-bottom: 10px; }
    .finding-column h3 span { color: var(--muted); }
    .finding-card { padding: 14px; margin-bottom: 10px; border-left-width: 5px; }
    .finding-card.critical, .finding-card.high { border-left-color: var(--fail); }
    .finding-card.medium, .finding-card.low { border-left-color: var(--warn); }
    .finding-card.info { border-left-color: var(--info); }
    .finding-type { font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 6px; }
    .finding-card h4 { font-size: 15px; }
    .remediation-box {
      margin-top: 12px;
      padding: 10px;
      border: 1px solid #ece6d8;
      border-radius: 8px;
      background: #fffaf0;
    }
    .remediation-box strong {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6c4a00;
    }
    .remediation-box strong span { color: var(--muted); }
    .remediation-box p, .remediation-box li { color: #4b4131; font-size: 12px; }
    .remediation-box p { margin-top: 8px; }
    .remediation-box ol { margin: 8px 0 0; padding-left: 18px; }
    .asset-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .asset-links a {
      display: inline-flex;
      padding: 4px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 700;
    }
    .evidence-thumb {
      display: block;
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      background: #f8f8f4;
    }
    .evidence-thumb img {
      display: block;
      width: 100%;
      max-height: 260px;
      object-fit: contain;
      object-position: top center;
      background: #111;
      border-bottom: 1px solid var(--line);
    }
    .evidence-thumb span {
      display: block;
      padding: 8px 10px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .finding-sources {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .finding-sources strong { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .source-row { display: flex; flex-direction: column; gap: 2px; }
    .source-row small, .finding-sources > small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    a { color: #1d4f91; text-decoration-thickness: 1px; overflow-wrap: anywhere; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
    figure { margin: 0; overflow: hidden; }
    figure img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; object-position: top; background: #eee; border-bottom: 1px solid var(--line); }
    figcaption { padding: 10px; display: flex; flex-direction: column; gap: 4px; min-height: 88px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    .empty { color: var(--muted); }
    @media (max-width: 900px) {
      .topbar { align-items: flex-start; flex-direction: column; padding: 24px; }
      .run-meta { align-items: flex-start; }
      .stats, .calendar, .run-status-grid, .history-card { grid-template-columns: 1fr; }
      main { padding-inline: 14px; }
    }

    :root {
      --bg: #eef3f8;
      --bg-soft: #f7f9fc;
      --panel: rgba(255, 255, 255, 0.84);
      --panel-strong: #ffffff;
      --ink: #142033;
      --muted: #647184;
      --faint: #8795a8;
      --line: #d7e0eb;
      --line-strong: #b9c8d9;
      --ok: #16784b;
      --warn: #9a6500;
      --fail: #bd2d23;
      --info: #315d9b;
      --cyan: #1f7a86;
      --code-bg: #101824;
      --code-ink: #e8eef7;
      --mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    html { min-height: 100%; max-width: 100%; overflow-x: clip; scroll-behavior: smooth; }
    body {
      min-height: 100%;
      max-width: 100%;
      overflow-x: clip;
      background:
        linear-gradient(90deg, rgba(49, 93, 155, 0.045) 1px, transparent 1px),
        linear-gradient(180deg, rgba(49, 93, 155, 0.035) 1px, transparent 1px),
        linear-gradient(180deg, #f8fbff 0%, var(--bg) 48%, #e8f0f7 100%);
      background-size: 44px 44px, 44px 44px, auto;
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.44;
      -webkit-font-smoothing: antialiased;
      font-feature-settings: "tnum";
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(240px, 520px);
      gap: 24px;
      align-items: center;
      padding: 15px 22px;
      border-bottom: 1px solid rgba(130, 151, 174, 0.42);
      background: rgba(246, 250, 254, 0.82);
      backdrop-filter: blur(16px);
    }
    .topbar > div:first-child {
      position: relative;
      min-width: 0;
      padding-left: 44px;
    }
    .topbar > div:first-child::before {
      content: "AIM";
      position: absolute;
      left: 0;
      top: 1px;
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border: 1px solid var(--ink);
      background: var(--ink);
      color: #f7fbff;
      font-size: 9px;
      font-weight: 900;
      line-height: 1;
    }
    h1 {
      margin-top: 10px;
      font-size: clamp(28px, 3.4vw, 48px);
      font-weight: 900;
      line-height: 0.96;
      text-transform: uppercase;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    h2 { font-size: clamp(22px, 2.4vw, 34px); line-height: 1.02; }
    h3 { line-height: 1.12; }
    h4 { line-height: 1.18; }
    .eyebrow {
      color: var(--info);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .run-meta {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      max-width: 520px;
      font-family: var(--mono);
      font-size: 11px;
    }
    .run-meta > * {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 5px 9px;
      border: 1px solid rgba(130, 151, 174, 0.34);
      background: rgba(255, 255, 255, 0.58);
      color: inherit;
      text-decoration: none;
    }
    .run-meta a:hover { border-color: var(--info); color: var(--info); background: #fff; }
    main { width: min(1500px, calc(100vw - 32px)); padding: 26px 0 64px; }
    .stats { gap: 14px; }
    .stat-card, .panel, .calendar-card, .finding-card, figure {
      border-color: var(--line);
      border-radius: 18px;
      background: var(--panel);
    }
    .stat-card {
      position: relative;
      min-height: 132px;
      padding: 18px;
      overflow: hidden;
      background:
        linear-gradient(90deg, rgba(49, 93, 155, 0.055) 1px, transparent 1px),
        linear-gradient(180deg, rgba(49, 93, 155, 0.04) 1px, transparent 1px),
        rgba(255, 255, 255, 0.78);
      background-size: 24px 24px;
    }
    .stat-card::after {
      content: "";
      position: absolute;
      inset: 0;
      border-left: 5px solid rgba(49, 93, 155, 0.34);
      pointer-events: none;
    }
    .stat-value { font-size: clamp(34px, 4vw, 52px); font-weight: 900; line-height: 0.92; }
    .stat-label { margin-top: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
    .stat-card p, .calendar-card p, .finding-card p, figcaption span { color: var(--muted); font-size: 12px; }
    .panel {
      padding: clamp(18px, 2.2vw, 28px);
      background:
        linear-gradient(90deg, rgba(49, 93, 155, 0.04) 1px, transparent 1px),
        linear-gradient(180deg, rgba(49, 93, 155, 0.032) 1px, transparent 1px),
        var(--panel);
      background-size: 32px 32px;
      backdrop-filter: blur(8px);
    }
    .section-head {
      align-items: flex-start;
      gap: 18px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(130, 151, 174, 0.28);
    }
    .calendar-card, .run-status-card, .rerun-box, .history-card, .top-findings a {
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.72);
    }
    .calendar-card .date { font-family: var(--mono); }
    .run-status-card h3, .rerun-box h3, .top-findings h3 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    pre {
      max-width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      background: var(--code-bg);
      color: var(--code-ink);
      overflow-x: auto;
      contain: paint;
    }
    .top-findings a {
      border-left: 5px solid rgba(189, 45, 35, 0.42);
    }
    .compact-panel code { border-radius: 6px; background: #e8eef6; }
    .site-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .site-card {
      min-height: 168px;
      padding: 22px;
      border-color: var(--line);
      border-radius: 18px;
      background:
        linear-gradient(90deg, rgba(49, 93, 155, 0.05) 1px, transparent 1px),
        linear-gradient(180deg, rgba(49, 93, 155, 0.038) 1px, transparent 1px),
        rgba(255, 255, 255, 0.78);
      background-size: 28px 28px;
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .site-card:hover, .site-card:focus-visible {
      transform: translateY(-3px);
      border-color: var(--info);
      background-color: #fff;
      outline: none;
    }
    .site-card.not-run { background: rgba(246, 249, 252, 0.62); }
    .site-card strong { font-size: clamp(28px, 3vw, 42px); line-height: 0.98; }
    .pill {
      align-items: center;
      width: fit-content;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 900;
      line-height: 1;
      background: rgba(255, 255, 255, 0.62);
    }
    .pill.info, .pill.low, .pill.medium { color: var(--info); }
    .token { background: #eaf0f7; color: #34445a; }
    .token.gap { background: #fff4d8; color: #6c4a00; }
    .score-track { background: #dfe7f0; }
    .findings-board { grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); }
    .finding-column h3 { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; }
    .finding-card {
      border-left-width: 6px;
      background: rgba(255, 255, 255, 0.8);
    }
    .finding-card.critical, .finding-card.high {
      background: linear-gradient(90deg, rgba(189, 45, 35, 0.09), rgba(255, 255, 255, 0.86) 34%);
    }
    .finding-card.medium, .finding-card.low {
      background: linear-gradient(90deg, rgba(154, 101, 0, 0.08), rgba(255, 255, 255, 0.86) 34%);
    }
    .remediation-box {
      border-color: #ead7aa;
      border-radius: 12px;
      background: #fff8e7;
    }
    .asset-links a {
      align-items: center;
      background: rgba(255, 255, 255, 0.7);
    }
    .asset-links a:hover { border-color: var(--info); background: #fff; }
    .evidence-thumb {
      border-color: var(--line-strong);
      border-radius: 12px;
      background: #f4f7fb;
    }
    .evidence-thumb img {
      max-height: 320px;
      background: #0d131d;
    }
    .evidence-preview {
      display: grid;
      grid-template-columns: 148px minmax(0, 1fr);
      gap: 10px;
      align-items: stretch;
      margin-top: 12px;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      background: rgba(244, 247, 251, 0.92);
      color: inherit;
      overflow: hidden;
      text-decoration: none;
    }
    .evidence-preview:hover {
      border-color: var(--info);
      background: #fff;
    }
    .evidence-preview-frame {
      display: block;
      height: 112px;
      min-height: 104px;
      background: #0d131d;
      overflow: hidden;
    }
    .evidence-preview-frame img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: var(--evidence-focus-x, 50%) var(--evidence-focus-y, 50%);
      background: #0d131d;
    }
    .evidence-preview-copy {
      display: grid;
      align-content: center;
      gap: 4px;
      min-width: 0;
      padding: 10px 10px 10px 0;
    }
    .evidence-preview-copy strong {
      font-size: 11px;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .evidence-preview-copy span,
    .evidence-preview-copy em {
      color: var(--muted);
      font-size: 11px;
      font-style: normal;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .evidence-preview.focus-blank {
      border-color: rgba(154, 101, 0, 0.62);
      background: linear-gradient(90deg, rgba(255, 248, 231, 0.95), rgba(255, 255, 255, 0.78));
    }
    .evidence-preview.focus-overlap,
    .evidence-preview.focus-manual {
      border-color: rgba(189, 45, 35, 0.62);
      background: linear-gradient(90deg, rgba(255, 244, 242, 0.95), rgba(255, 255, 255, 0.78));
    }
    a { color: #245995; text-underline-offset: 2px; }
    .gallery-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .gallery-summary span {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.72);
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .gallery-summary strong { color: var(--ink); }
    .gallery { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    figure {
      background: rgba(255, 255, 255, 0.76);
    }
    figure.suspicious {
      border-color: rgba(189, 45, 35, 0.78);
      background: linear-gradient(180deg, rgba(255, 244, 242, 0.94), rgba(255, 255, 255, 0.82));
    }
    figure.changed { border-color: rgba(154, 101, 0, 0.72); }
    figure.overlap { border-color: rgba(189, 45, 35, 0.88); }
    figure.blank { border-color: rgba(154, 101, 0, 0.8); }
    .screenshot-frame {
      display: block;
      background: #0d131d;
      border-bottom: 1px solid var(--line);
    }
    figure img {
      height: 230px;
      aspect-ratio: auto;
      object-fit: contain;
      object-position: top center;
      background: #0d131d;
    }
    figure.suspicious img { background: #12120f; }
    figure:target {
      outline: 3px solid rgba(49, 93, 155, 0.36);
      outline-offset: 4px;
    }
    figcaption { min-height: 148px; }
    figcaption strong { font-size: 12px; line-height: 1.25; }
    figcaption .pill { margin-top: 0; }
    .table-wrap {
      display: block;
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      contain: paint;
      -webkit-overflow-scrolling: touch;
    }
    .table-wrap table {
      width: max-content;
      min-width: 100%;
      max-width: none;
    }
    tr:hover td { background: rgba(255, 255, 255, 0.46); }
    ::selection { background: rgba(49, 93, 155, 0.18); }
    @media (max-width: 900px) {
      .topbar {
        display: grid;
        grid-template-columns: 1fr;
        position: static;
        align-items: flex-start;
        padding: 16px;
      }
      .topbar > div:first-child { padding-left: 40px; }
      .run-meta { justify-content: flex-start; align-items: center; }
      main { width: min(100% - 24px, 1500px); padding: 18px 0 48px; }
      .section-head { flex-direction: column; }
      .gallery { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
      figure img { height: 190px; }
      figcaption { min-height: 128px; }
      .evidence-preview {
        grid-template-columns: 1fr;
      }
      .evidence-preview-frame {
        height: 150px;
        aspect-ratio: 16 / 9;
      }
      .evidence-preview-copy {
        padding: 10px;
      }
      .table-wrap {
        overflow-x: hidden;
        contain: layout paint;
      }
      .table-wrap table,
      .table-wrap thead,
      .table-wrap tbody,
      .table-wrap tr,
      .table-wrap th,
      .table-wrap td {
        display: block;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }
      .table-wrap thead { display: none; }
      .table-wrap tr {
        margin-bottom: 10px;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.7);
      }
      .table-wrap td {
        padding: 7px 0;
        border-bottom: 1px solid rgba(130, 151, 174, 0.24);
        overflow-wrap: anywhere;
      }
      .table-wrap td:last-child { border-bottom: 0; }
    }
    @media (max-width: 520px) {
      h1 { font-size: clamp(27px, 12vw, 44px); }
      .stats { gap: 10px; }
      .panel { padding: 14px; border-radius: 14px; }
      .site-card { min-height: 138px; padding: 16px; }
      .findings-board { grid-template-columns: 1fr; }
      .gallery { grid-template-columns: 1fr; }
      figure img { height: 250px; }
      .run-meta > * { max-width: 100%; }
    }
  `;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
