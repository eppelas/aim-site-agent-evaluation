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
| done | Generate history storage manifests | Dashboard generation writes `reports/latest/storage-manifest.json`, `reports/history/index.json`, and `reports/history/storage-manifest.json`. |
| done | Add lightweight CI workflow | PR/push validation without full screenshot sweep. |
| done | Harden workflow permissions/concurrency | Read-only permissions and single active scheduled run per ref. |
| done | Document GitHub setup | Repo creation, Actions enablement, first manual run, artifact review. |
| done | Document DeviceCloud path | `docs/13-device-cloud-integration.md` and `config/device-cloud-matrix.json`. |
| done | Add optional DeviceCloud workflow shell | `.github/workflows/device-cloud.yml` checks provider secrets and skips cleanly until a real adapter is implemented. |
| done | Add CMS contract preflight | `ci.yml` and `site-qa.yml` run `npm run cms:contract` and skip cleanly until Sanity env/secrets exist. |

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
- `SANITY_PROJECT_ID`;
- `SANITY_DATASET`;
- `SANITY_API_VERSION`;
- `SANITY_READ_TOKEN`;
- `SANITY_PERSPECTIVE`;
- `QA_HISTORY_S3_ENDPOINT`;
- `QA_HISTORY_S3_BUCKET`;
- `QA_HISTORY_S3_ACCESS_KEY_ID`;
- `QA_HISTORY_S3_SECRET_ACCESS_KEY`;
- `QA_HISTORY_S3_REGION`.

## First GitHub Acceptance Criteria

- done: CI workflow passed on push.
- done: Manual `monthly` workflow finished, uploaded report artifacts, and deployed GitHub Pages.
- done: Hosted dashboard opens at `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.html`.
- done: Hosted production dashboard opens at `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.production.html`.
- done: Hosted staging dashboard opens at `https://eppelas.github.io/aim-site-agent-evaluation/reports/latest/dashboard.staging.html`.
- done: Scheduled workflow is visible and active.
- done: No generated screenshots/reports are committed to git.

## Open Follow-Up Tasks

- Add provider-specific DeviceCloud adapter for BrowserStack/TestMu AI/Sauce Labs sessions.
- Add R2/S3-compatible artifact sync adapter that reads the generated storage manifests.
- Add GitHub issue creation only after false positive rate is understood.
