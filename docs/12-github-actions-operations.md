# GitHub Actions Operations

This repo is ready to run website QA through GitHub Actions after it is pushed to GitHub.

Repository:

- `https://github.com/eppelas/aim-site-agent-evaluation`

Hosted dashboards:

- `https://eppelas.github.io/aim-site-agent-evaluation/`
- `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.html`
- `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.production.html`
- `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.staging.html`

## Workflows

### CI

File: `.github/workflows/ci.yml`

Triggers:

- pull requests;
- pushes to `main`.

What it does:

- installs dependencies with `npm ci`;
- runs `npm run typecheck`;
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

- GitHub Actions artifact with `reports/latest/**`, `artifacts/latest/**`, and `artifacts/baselines/**`.
- GitHub Pages static site generated from the latest dashboard output.
- Visual baseline cache for screenshot comparison across runs.

Hosted dashboard paths:

- `/reports/latest/dashboard.html` - index dashboard.
- `/reports/latest/dashboard.production.html` - production dashboard.
- `/reports/latest/dashboard.staging.html` - staging dashboard.

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
- `artifacts/latest/screenshots/...` for screenshot modes.
- `artifacts/latest/screenshots/.../diff.png` where a screenshot differs from baseline.
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

- BrowserStack;
- Checkly;
- Percy or Argos;
- Google Drive;
- Cloudflare R2/S3;
- Sanity read token;
- AI model API key for LLM scoring.

Do not add secrets until the corresponding integration is implemented.

## Current Limitations

- GitHub Actions will only run after the local repo is published to GitHub.
- No issue creation yet; artifacts are the review surface.
- GitHub Pages shows the latest run, not a full historical database yet.
- No external artifact bucket yet; Actions artifacts are retained for 14 or 30 days.
- No real-device BrowserStack run yet.

## Failure Handling

The workflows upload reports with `if: always()` where possible. If QA finds site issues but the runner completes, the artifact should still be available.

If the job fails before report generation:

- check `npm ci`;
- check `npm run typecheck`;
- check network access to `aimindset.org` and `staging.aimindset.org`;
- retry manual `health` mode before running screenshot-heavy modes.
