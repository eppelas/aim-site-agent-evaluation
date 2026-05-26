# GitHub Actions Operations

This repo is ready to run website QA through GitHub Actions after it is pushed to GitHub.

Repository:

- `https://github.com/eppelas/aim-site-agent-evaluation`

Hosted dashboards:

- `https://eppelas.github.io/aim-site-agent-evaluation/`
- `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.html`
- `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.production.html`
- `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.staging.html`
- `https://eppelas.github.io/aim-site-agent-evaluation/reports/history/index.html`

## Workflows

### CI

File: `.github/workflows/ci.yml`

Triggers:

- pull requests;
- pushes to `main`.

What it does:

- installs dependencies with `npm ci`;
- runs `npm run typecheck`;
- runs `npm run cms:contract`, which skips cleanly until Sanity env/secrets exist;
- runs health QA without screenshots;
- generates `reports/latest/dashboard.html`;
- uploads `reports/latest/**` as a workflow artifact.

Purpose:

- keep the QA repo itself valid;
- catch TypeScript and report-generation failures before scheduled jobs run.

### AI Mindset Site QA

File: `.github/workflows/site-qa.yml`

Triggers:

- manual `workflow_dispatch`;
- scheduled biweekly candidate run;
- scheduled monthly broad sweep.

Manual modes:

- `health`: no screenshots, fastest report.
- `biweekly`: production + staging, mobile/desktop screenshots, 12 routes per site.
- `monthly`: production + staging, expanded viewport set, no screenshot route limit.

Schedule:

- biweekly candidate: every Monday at `07:00 UTC`.
- ISO-week guard: odd ISO weeks are skipped, even ISO weeks run.
- monthly broad sweep: first day of each month at `08:00 UTC`.

What it publishes:

- GitHub Actions artifact with `reports/latest/**`, `reports/history/**`, `artifacts/history/**`, `artifacts/latest/**`, and `artifacts/baselines/**`.
- GitHub Pages static site generated from the latest dashboard output.
- Visual baseline cache for screenshot comparison across runs.
- Storage manifests for future durable sync: `reports/latest/storage-manifest.json` and `reports/history/storage-manifest.json`.
- CMS contract preflight output before QA begins; it skips without Sanity env/secrets and produces field-group coverage once configured.
- Guarded durable sync through `npm run sync:history`; it skips when R2/S3 secrets are absent.

Hosted dashboard paths:

- `/reports/latest/dashboard.html` - index dashboard.
- `/reports/latest/dashboard.production.html` - production dashboard.
- `/reports/latest/dashboard.staging.html` - staging dashboard.
- `/reports/history/index.html` - run history dashboard.
- `/reports/history/<runId>/dashboard.html` - archived dashboard for a specific run.

### AI Mindset Device Cloud QA

File: `.github/workflows/device-cloud.yml`

Triggers:

- manual `workflow_dispatch`;
- scheduled monthly preflight on the second day of each month at `09:00 UTC`.

Manual inputs:

- provider: `browserstack`, `lambdatest`, or `saucelabs`;
- scope: `smoke`, `monthly`, or `launch`.

Current behavior:

- checks whether the selected provider secrets exist;
- writes a GitHub Step Summary explaining readiness or missing secrets;
- does not attempt paid cloud sessions yet;
- if secrets exist, runs TypeScript validation and stops at an explicit adapter-pending step.

Purpose:

- keep the DeviceCloud delivery path visible in GitHub Actions;
- avoid breaking normal QA when no paid provider account is configured;
- provide a safe place to add the BrowserStack/TestMu AI/Sauce Labs adapter later.

## First Setup After Push

Completed on 2026-05-21:

- GitHub repository created and pushed.
- CI passed on push.
- Pages enabled with GitHub Actions as the source.
- Manual `monthly` run completed successfully: `https://github.com/eppelas/aim-site-agent-evaluation/actions/runs/26252035605`.
- Hosted dashboard URLs returned HTTP 200.

For future manual runs:

1. Open **AI Mindset Site QA** in GitHub Actions.
2. Click **Run workflow**.
3. Choose `health`, `biweekly`, or `monthly`.
4. Wait for the run to complete.
5. Open the Pages dashboard URLs above.

## Artifact Review

Each workflow run uploads artifacts.

Expected paths:

- `reports/latest/report.json`;
- `reports/latest/summary.md`;
- `reports/latest/dashboard.html`;
- `reports/latest/dashboard.production.html`;
- `reports/latest/dashboard.staging.html`;
- `reports/latest/storage-manifest.json`;
- `reports/history/<runId>/report.json`;
- `reports/history/<runId>/summary.md`;
- `reports/history/<runId>/dashboard.html`;
- `reports/history/index.html`;
- `reports/history/index.json`;
- `reports/history/storage-manifest.json`;
- `artifacts/history/<runId>/screenshots/...` for screenshot modes.
- `artifacts/history/<runId>/diffs/...` where a screenshot differs from baseline.
- `artifacts/baselines/screenshots/...` for the current visual comparison base.

Recommended review order:

1. Open `summary.md` for quick status.
2. Open `dashboard.html` for visual triage.
3. Inspect screenshot gallery for obvious layout breaks.
4. Review findings by severity.
5. Review migration map before any staging launch.

## Secrets

V0 requires no GitHub secrets.

Future integrations may require secrets:

- BrowserStack: `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`;
- TestMu AI / LambdaTest: `LT_USERNAME`, `LT_ACCESS_KEY`;
- Sauce Labs: `SAUCE_USERNAME`, `SAUCE_ACCESS_KEY`;
- Checkly;
- Percy or Argos;
- Google Drive;
- Cloudflare R2/S3: `QA_HISTORY_S3_ENDPOINT`, `QA_HISTORY_S3_BUCKET`, `QA_HISTORY_S3_ACCESS_KEY_ID`, `QA_HISTORY_S3_SECRET_ACCESS_KEY`, `QA_HISTORY_S3_REGION`;
- Sanity: `SANITY_PROJECT_ID`, `SANITY_DATASET`, optional `SANITY_API_VERSION`, `SANITY_PERSPECTIVE`, and `SANITY_READ_TOKEN`;
- AI model API key for LLM scoring.

Do not add secrets until the corresponding integration is implemented.

## Current Limitations

- GitHub Actions will only run after the local repo is published to GitHub.
- No issue creation yet; artifacts are the review surface.
- GitHub Pages now has generated run history, but no external artifact bucket yet.
- R2/S3 sync adapter exists, but it cannot upload until bucket credentials are configured.
- Actions artifacts are retained for 30 days unless workflow retention changes.
- No real-device BrowserStack run yet.

## Failure Handling

The workflows upload reports with `if: always()` where possible. If QA finds site issues but the runner completes, the artifact should still be available.

If the job fails before report generation:

- check `npm ci`;
- check `npm run typecheck`;
- check network access to `aimindset.org` and `staging.aimindset.org`;
- retry manual `health` mode before running screenshot-heavy modes.
