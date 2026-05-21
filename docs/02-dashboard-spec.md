# Dashboard Spec

The dashboard should behave like a QA calendar, evidence board, and launch readiness center.

## Primary Views

V0 implementation status: `reports/latest/dashboard.html` is generated from `reports/latest/report.json` by `npm run dashboard`.

Current V0 includes:

- summary cards;
- simple checks timeline;
- run status drilldown with failure reason, top findings, local rerun command, and GitHub Actions rerun command;
- grouped findings board;
- screenshot gallery;
- checked-pages table.

Future versions should add persistent history across runs, filtering, approvals, migration compare, and trend charts.

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
