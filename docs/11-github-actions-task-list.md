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
| pending | Create GitHub repo | GitHub web UI or `gh repo create`, only after explicit push approval. |
| pending | Push local repo | Requires explicit approval to publish. |
| pending | Enable GitHub Actions | Repo Settings → Actions. |
| pending | Enable GitHub Pages | Pages source should be GitHub Actions. |
| pending | Run manual `monthly` workflow | Actions → AI Mindset Site QA → Run workflow. |
| pending | Review first hosted dashboard | Open GitHub Pages dashboard URLs after deployment. |
| pending | Confirm schedule timezone | GitHub cron runs in UTC. |

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

- CI workflow passes on push.
- Manual `monthly` workflow finishes, uploads report artifacts, and deploys GitHub Pages.
- Hosted dashboard opens at `/reports/latest/dashboard.html`.
- Hosted production dashboard opens at `/reports/latest/dashboard.production.html`.
- Hosted staging dashboard opens at `/reports/latest/dashboard.staging.html`.
- Scheduled workflow is visible and active.
- No generated screenshots/reports are committed to git.

## Open Follow-Up Tasks

- Add external URL live status checks for classified links.
- Add date normalization and stale lab rules.
- Add artifact retention policy once real storage is chosen.
- Add optional DeviceCloud job that skips cleanly until provider secrets exist.
- Add GitHub issue creation only after false positive rate is understood.
