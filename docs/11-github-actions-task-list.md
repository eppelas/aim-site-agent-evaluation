# GitHub Actions Task List

This checklist tracks the GitHub Actions implementation and the remaining setup needed after the local repo is published.

## Local Implementation Tasks

| Status | Task | Notes |
| --- | --- | --- |
| done | Create scheduled QA workflow | `.github/workflows/site-qa.yml` exists. |
| done | Support manual dispatch | `workflow_dispatch` with `health`, `biweekly`, `monthly`. |
| done | Support biweekly cadence | Weekly cron plus ISO-week guard. |
| done | Support monthly broad sweep | First day of month at `08:00 UTC`. |
| done | Upload reports and artifacts | Uploads `reports/latest/**` and `artifacts/latest/**`. |
| done | Generate dashboard in Actions | Runs `npm run dashboard`. |
| done | Publish dashboards to GitHub Pages | Deploys latest production and staging dashboards from `site-qa.yml`. |
| done | Cache visual baselines | Restores prior baselines and saves fresh screenshot baselines for future diffs. |
| done | Add lightweight CI workflow | PR/push validation without full screenshot sweep. |
| done | Harden workflow permissions/concurrency | Read-only permissions and single active scheduled run per ref. |
| done | Document GitHub setup | Repo creation, Actions enablement, first manual run, artifact review. |
| done | Document DeviceCloud path | `docs/13-device-cloud-integration.md` and `config/device-cloud-matrix.json`. |

## Required GitHub UI Steps After Push

| Status | Task | Where |
| --- | --- | --- |
| done | Create GitHub repo | `https://github.com/eppelas/aim-site-agent-evaluation`. |
| done | Push local repo | Initial repo pushed to `main`. |
| done | Enable GitHub Actions | Workflows are active. |
| done | Enable GitHub Pages | Pages source is GitHub Actions. |
| done | Run manual `monthly` workflow | Run `26252035605` completed successfully. |
| done | Review first hosted dashboard | Pages URLs returned HTTP 200. |
| done | Confirm schedule timezone | GitHub cron runs in UTC. |

## Optional Secrets Later

No secrets are required for V0.

Future integrations may need:

- `BROWSERSTACK_USERNAME`;
- `BROWSERSTACK_ACCESS_KEY`;
- `LT_USERNAME`;
- `LT_ACCESS_KEY`;
- `SAUCE_USERNAME`;
- `SAUCE_ACCESS_KEY`;
- `CHECKLY_API_KEY`;
- `PERCY_TOKEN` or `ARGOS_TOKEN`;
- `GOOGLE_DRIVE_SERVICE_ACCOUNT`;
- `R2_ACCESS_KEY_ID`;
- `R2_SECRET_ACCESS_KEY`;
- `SANITY_READ_TOKEN`.

## First GitHub Acceptance Criteria

- done: CI workflow passed on push.
- done: Manual `monthly` workflow finished, uploaded report artifacts, and deployed GitHub Pages.
- done: Hosted dashboard opens at `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.html`.
- done: Hosted production dashboard opens at `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.production.html`.
- done: Hosted staging dashboard opens at `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.staging.html`.
- done: Scheduled workflow is visible and active.
- done: No generated screenshots/reports are committed to git.

## Open Follow-Up Tasks

- Add external URL live status checks for classified links.
- Add date normalization and stale lab rules.
- Add artifact retention policy once real storage is chosen.
- Add optional DeviceCloud job that skips cleanly until provider secrets exist.
- Add GitHub issue creation only after false positive rate is understood.
