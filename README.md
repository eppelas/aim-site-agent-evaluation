# AIM Site Agent Evaluation

Black-box QA and agent-readability evaluation repository for the AI Mindset websites.

This repo is intentionally separate from the site source code. It should monitor the live public surfaces as an outside user or AI agent would see them:

- Production: `https://aimindset.org/`
- Staging: `https://staging.aimindset.org/`
- GitHub repo: `https://github.com/eppelas/aim-site-agent-evaluation`
- GitHub Pages dashboard: `https://eppelas.github.io/aim-site-agent-evaluation/`

The production site is the canonical baseline. The staging site is the Astro/Sanity replacement candidate. A third operating mode, migration comparison, checks whether staging is ready to replace production.

## What This Repo Captures

- Visual regression across desktop, tablet, and mobile.
- Workflow checks for links, buttons, menus, forms, CTAs, bots, payment/waitlist paths, and content pages.
- Date and content freshness for labs, cohorts, event starts, application windows, and CTA states.
- Performance history, slow-network loading, animation/rendering behavior, and full-page screenshot archives.
- Agent-readability: `llms.txt`, Markdown mirrors, JSON-LD, semantic HTML, crawler policy, and LLM interpretation quality.
- Dashboard requirements for previous checks, future checks, findings, screenshots, approvals, and migration readiness.

## Current Status

This repo now includes a V0 executable QA runner. It is intentionally small: route discovery, HTTP/link health, surface-file checks, screenshot capture, and local reports.

Recommended implementation path:

1. Create deterministic local checks with Playwright and JSON reports.
2. Add scheduled GitHub Actions or Checkly runs.
3. Add visual review through Percy, Argos, or Applitools.
4. Add BrowserStack real-device sweeps for launch readiness.
5. Add DebugBear or SpeedCurve for performance history.
6. Add Sitebulb or Screaming Frog for technical crawl audits.
7. Add agent-readability evals and AI visibility monitoring.

## V0 Commands

Install dependencies:

```bash
npm install
npm run playwright:install
```

Run health/link discovery without screenshots:

```bash
npm run qa -- --site all --max-crawl-pages 80
```

Run the V0 smoke with screenshots:

```bash
npm run qa:v0
```

Run one site only:

```bash
npm run qa -- --site staging --screenshots --screenshot-viewports mobile,desktop --screenshot-limit 12
```

Validate TypeScript:

```bash
npm run typecheck
```

Generated output:

- `reports/latest/report.json`
- `reports/latest/summary.md`
- `reports/latest/dashboard.html`
- `reports/latest/dashboard.production.html`
- `reports/latest/dashboard.staging.html`
- `artifacts/latest/screenshots/...`

These generated outputs are ignored by git except for placeholder `.gitkeep` files.

Generate the static dashboard from the latest report:

```bash
npm run dashboard
```

Current dashboard sections:

- index page with separate production and staging dashboards;
- summary cards;
- checks timeline;
- run status drilldown with failure reason, top findings, and local/GitHub rerun commands;
- findings board;
- source evidence for broken URLs, including sitemap/config source or page-level source URL, link text, and nearest extracted section when available;
- external target freshness checks for event links that return 200 but point to past events;
- screenshot gallery;
- screenshot baseline status: first run creates baselines; later runs use pixel diff and write `diff.png` artifacts for meaningful visual changes;
- external link intent inventory;
- visible date token inventory;
- production-to-staging migration map;
- checked pages table.

## Automation

GitHub Actions workflow:

- `.github/workflows/ci.yml`
- `.github/workflows/site-qa.yml`

Supported triggers:

- CI on pull requests and pushes to `main`.
- Manual `workflow_dispatch`: `health`, `biweekly`, or `monthly`.
- Scheduled biweekly candidate: every Monday at `07:00 UTC`, with an ISO-week guard so it only runs on even weeks.
- Scheduled monthly broad sweep: first day of every month at `08:00 UTC`.

Scheduled modes:

- `biweekly`: `npm run qa:biweekly`
  - production + staging;
  - route discovery and HTTP/link health;
  - mobile + desktop screenshots;
  - screenshot limit 12 routes per site;
  - GitHub artifact upload.
- `monthly`: `npm run qa:monthly`
  - production + staging;
  - expanded mobile/tablet/desktop/HD screenshot viewports;
  - no screenshot route limit;
  - GitHub artifact upload.

The workflow uploads run artifacts:

- `reports/latest/**`
- `artifacts/latest/**`
- `artifacts/baselines/**`

The scheduled/manual QA workflow also publishes GitHub Pages from the latest run:

- `/reports/latest/dashboard.html` - index dashboard.
- `/reports/latest/dashboard.production.html` - production-only dashboard.
- `/reports/latest/dashboard.staging.html` - staging-only dashboard.

Visual baselines are restored and saved through GitHub Actions cache so the first screenshot run creates the comparison base, and later screenshot runs can show local pixel diffs in the dashboard.

The workflows are present locally but will only run after this repo is pushed to GitHub and Actions/Pages are enabled.

See:

- `docs/11-github-actions-task-list.md`
- `docs/12-github-actions-operations.md`
- `docs/13-device-cloud-integration.md`

## Repository Layout

- `docs/` - product and technical specifications.
- `config/` - seed configuration for sites, routes, browsers, and viewports.
- `reports/` - local report output placeholder, ignored except `.gitkeep`.
- `artifacts/` - local artifact output placeholder, ignored except `.gitkeep`.

## No Remote Push By Default

This repo is local until explicitly reviewed and approved for GitHub publication.
