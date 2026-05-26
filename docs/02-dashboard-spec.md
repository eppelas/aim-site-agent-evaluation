# Dashboard Spec

The dashboard should behave like a QA calendar, evidence board, and launch readiness center.

## Primary Views

V1 implementation status: `reports/latest/dashboard.html` is generated from `reports/latest/report.json` by `npm run dashboard`.

Current V1 includes:

- summary cards;
- simple checks timeline;
- run status drilldown with failure reason, top findings, local rerun command, and GitHub Actions rerun command;
- history index at `reports/history/index.html`;
- per-run archive dashboards under `reports/history/<runId>/`;
- grouped findings board;
- screenshot gallery;
- agent-readability score table;
- migration content similarity table;
- checked-pages table.

Future versions should add filtering, approvals, trend charts, and external durable storage.

### History View

The local/GitHub Pages history layer stores:

- `reports/latest/*` as the current run pointer;
- `reports/history/<runId>/report.json`;
- `reports/history/<runId>/summary.md`;
- `reports/history/<runId>/dashboard.html`;
- `reports/history/<runId>/dashboard.production.html` when production is included;
- `reports/history/<runId>/dashboard.staging.html` when staging is included;
- `reports/history/index.html` as the archive index;
- `reports/history/index.json` as the machine-readable archive index;
- `reports/latest/storage-manifest.json` as the current-run upload contract;
- `reports/history/storage-manifest.json` as the full local-history upload contract;
- `artifacts/history/<runId>/...` for screenshot/diff artifacts from screenshot runs.

`latest` dashboards link to the history index. Historical dashboards link back to latest.

This is not a permanent object store yet. GitHub Pages publishes the generated history that exists in the workflow workspace, while GitHub Actions artifacts retain uploaded files for the configured retention window. The generated storage manifests include file size, SHA-256, type, run ID, and future destination keys so a later V2 can mirror history to R2/S3, Google Drive, or a database-backed dashboard.

### Calendar View

Shows past and future checks by day or week.

Card fields:

- check name;
- environment: production, staging, migration;
- status: planned, running, passed, warning, failed, accepted;
- severity;
- owner;
- scheduled time;
- report link;
- short failure label.
- drilldown link to explain why a failed/warning status happened and how to rerun the check.

The reference idea is a calendar with planned slots and colored cards for failed, warning, published, archived, and planned checks.

### Run Detail

One page per run.

Fields:

- run ID;
- date and timezone;
- environment;
- trigger type: scheduled, manual, deploy, migration;
- duration;
- route count;
- browser/device matrix;
- pass/warn/fail counts;
- links to reports and artifacts.
- rerun instructions for local CLI and GitHub Actions.
- top findings that explain the status.

### Findings Board

Kanban-style board:

- `error`;
- `warning`;
- `changed`;
- `needs-review`;
- `accepted`;
- `archived`.

Findings should be grouped by route and check type.

### Visual Gallery

For each route:

- desktop full-page screenshot;
- tablet full-page screenshot;
- mobile full-page screenshot;
- diff image;
- baseline image;
- current image;
- browser and viewport metadata.

### Migration Compare

Shows production URL to staging URL mapping.

Statuses:

- `mapped`;
- `missing`;
- `retired`;
- `changed`;
- `redirect-needed`;
- `manual-review`.

### Agent Readability

Displays:

- `llms.txt` status;
- markdown mirror status;
- JSON-LD status;
- canonical status;
- semantic HTML score;
- LLM factuality score;
- recommendation guidance score;
- prompt-injection risk flags.

### Performance Trends

Track:

- LCP;
- CLS;
- INP if available;
- TBT;
- Speed Index;
- First Visual Change;
- Visual Complete 95/99;
- total requests;
- transfer size;
- slow 4G deltas.

## Finding Severity

- `critical`: broken payment, broken primary CTA, production page unreachable, launch blocker.
- `high`: missing key section, severe visual break, stale active lab date, important route missing.
- `medium`: secondary CTA issue, metadata issue, performance regression.
- `low`: minor visual change, optional metadata, informational trend.

## Dashboard Data Sources

- Playwright JSON reports.
- Visual diff vendor reports.
- BrowserStack session URLs.
- DebugBear/SpeedCurve/WebPageTest results.
- Sitebulb/Screaming Frog exports.
- Agent-readability evaluator output.
- Manual approval records.
