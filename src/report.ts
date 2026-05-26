import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, RunReport } from "./types.js";

export async function writeReports(report: RunReport, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "summary.md"), renderSummary(report), "utf8");
}

export function buildSummary(findings: Finding[]): RunReport["summary"] {
  return {
    routesDiscovered: 0,
    pagesChecked: 0,
    screenshotsCaptured: 0,
    findingsTotal: findings.length,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
    info: findings.filter((finding) => finding.severity === "info").length
  };
}

function renderSummary(report: RunReport): string {
  const lines: string[] = [];
  lines.push(`# AIM Site Agent Evaluation Run`);
  lines.push("");
  lines.push(`- Run ID: \`${report.runId}\``);
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push(`- Sites: ${report.sites.map((site) => `\`${site}\``).join(", ")}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Routes discovered: ${report.summary.routesDiscovered}`);
  lines.push(`- Pages checked: ${report.summary.pagesChecked}`);
  lines.push(`- Screenshots captured: ${report.summary.screenshotsCaptured}`);
  lines.push(`- Findings: ${report.summary.findingsTotal}`);
  lines.push(`- Critical: ${report.summary.critical}`);
  lines.push(`- High: ${report.summary.high}`);
  lines.push(`- Medium: ${report.summary.medium}`);
  lines.push(`- Low: ${report.summary.low}`);
  lines.push(`- Info: ${report.summary.info}`);
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(`### ${finding.severity.toUpperCase()} / ${finding.checkType}: ${finding.title}`);
      lines.push("");
      lines.push(`- Site: \`${finding.siteId}\``);
      lines.push(`- URL: ${finding.url}`);
      lines.push(`- Status: \`${finding.status}\``);
      if (finding.expected) lines.push(`- Expected: ${finding.expected}`);
      if (finding.actual) lines.push(`- Actual: ${finding.actual}`);
      if (finding.remediation) {
        lines.push(`- Recommended owner: \`${finding.remediation.owner}\``);
        lines.push(`- Recommended fix: ${finding.remediation.summary}`);
      }
      lines.push("");
    }
  }

  lines.push("## Checked Pages");
  lines.push("");
  for (const check of report.checks) {
    lines.push(`- \`${check.siteId}\` ${check.status} ${check.url}`);
  }

  return `${lines.join("\n")}\n`;
}
