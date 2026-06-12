# Task Verification Canvas

## User Requests

| Status | Request | Owner | Last Checked | Notes |
| --- | --- | --- | --- | --- |
| self-checked | Publish both production and staging QA dashboards through GitHub Pages. | assistant | 2026-05-21 | Pages deployment succeeded in run `26252035605`. |
| self-checked | Add the local repo to GitHub. | assistant | 2026-05-21 | Repo pushed to `https://github.com/eppelas/aim-site-agent-evaluation`. |
| self-checked | Confirm hosted dashboard URLs after the first GitHub Actions run. | assistant | 2026-05-21 | Index, production, and staging dashboard URLs returned HTTP 200. |
| self-checked | Investigate staging dashboard failure reason and rerun staging QA. | assistant | 2026-05-27 | Fresh local staging run `2026-05-27T03-04-04-061Z-staging` found 14 findings with 5 high severity issues, explicitly including `/automation-lab`, `/labs/w26`, `/sprint-pos`, `/sitemap.xml`, and stale `/garden/` dates. |
| self-checked | Continue improvements after staging failure review. | assistant | 2026-05-22 | Added remediation metadata and screenshot sanity checks; validated with full staging run `2026-05-21T23-58-00-010Z-staging`. |
| implemented | Close unused subagents and create persistent project TODO. | assistant | 2026-05-22 | No project `.agent-hub` or screen/tmux agents were active; created `TODO.md`. |
| self-checked | Add conditional large blank-region screenshot review. | assistant | 2026-05-22 | Implemented raw-first screenshot capture plus scroll-settle retry only after a 600px+ blank band is detected; staging run `2026-05-22T19-16-34-396Z-staging` produced three screenshot findings with retry status. |
| self-checked | Add Date Freshness V1 / Agenda Reliability. | assistant | 2026-05-22 | Implemented visible date normalization and stale agenda findings; staging `/garden/` and production Luma event freshness are now captured. |
| self-checked | Document DeviceCloud provider choice and costs. | assistant | 2026-05-22 | Updated `docs/13-device-cloud-integration.md` with BrowserStack, TestMu AI/LambdaTest, Sauce Labs, and local Playwright comparison. |
| self-checked | Add CTA assertions. | assistant | 2026-05-22 | Implemented `config/cta-rules.json` and `cta-assertion` findings; latest all-sites run reports two production Google redirect CTA issues. |
| self-checked | Add optional DeviceCloud workflow. | assistant | 2026-05-22 | Added `.github/workflows/device-cloud.yml`; YAML parse passed and workflow skips until provider secrets/adapter exist. |
| self-checked | Add per-page agent-readability score. | assistant | 2026-05-22 | Implemented 0-100 page scoring and dashboard table; latest all-sites run reports poor scores across checked production/staging HTML pages. |
| self-checked | Add migration content similarity. | assistant | 2026-05-22 | Implemented title/heading/top-term similarity for mapped routes; latest all-sites run flags production `/` to staging `/` as `content-mismatch` at `8/100`. |
| self-checked | Add historical dashboard storage. | assistant | 2026-05-22 | Implemented `reports/history/<runId>`, `reports/history/index.html`, and `artifacts/history/<runId>` paths; validated with health and screenshot smoke runs. |
| self-checked | Add durable history storage manifest. | assistant | 2026-05-22 | Added storage config and manifest generation; `npm run dashboard` wrote latest/history manifests with SHA-256 hashes and destination keys. |
| self-checked | Add guarded R2/S3 history sync adapter. | assistant | 2026-05-22 | Added script and workflow step; dry-run and no-secret skip behavior both passed. |
| self-checked | Add HTML vs Markdown consistency checks. | assistant | 2026-05-22 | Implemented mirror fetch/compare for pages with Markdown alternates; latest staging smoke had no mirrors and produced no mirror mismatch findings. |
| self-checked | Add Sanity/Astro content contract preflight. | assistant | 2026-05-24 | Added guarded `npm run cms:contract`, wired it into CI/site QA, and documented required env plus next CMS-aware report steps. |
| self-checked | Prepare local remediation for staging legacy-route 404s. | assistant | 2026-05-28 | Added static redirect pages in the V3 site repo for `/automation-lab` -> `/`, `/labs/w26` -> `/labs/w26-main-lab/`, and `/sprint-pos` -> `/ai-mindset`; local `npm run lint` and `npm run build` passed, but hosted staging still needs deploy + rerun to close the findings. |
| self-checked | Add AI Native visual QA dashboard and Pages workflow mode. | assistant | 2026-06-12 | Added `ai-native` site config, `npm run qa:ai-native`, AI Native dashboard page, stable screenshot capture fallback/retry, and focused 13-inch route/menu evidence. Local run `2026-06-12T20-03-52-258Z-ai-native` captured 8 screenshots and found 9 issues. |
| self-checked | Replace unusable full-page AI Native evidence with browser/viewport/section visual QA evidence. | assistant | 2026-06-12 | `npm run qa:ai-native` now captures Chromium/Firefox/WebKit viewport-state evidence across mobile/tablet/13-inch/desktop/wide and 15 page sections, with full-page screenshots disabled for this profile. Run `2026-06-12T21-30-52-045Z-ai-native` captured 316 short evidence screenshots, 0 failed screenshots, and no full-page captures. |
| self-checked | Redesign QA dashboard UI in a light gray-blue Site Hub style. | assistant | 2026-06-13 | Restyled the generated dashboard shell in `src/dashboard/generate.ts` with a light gray-blue grid canvas, AIM mark, compact operational topbar, stronger cards, suspicious screenshot summary, suspicious-first screenshot sorting, and mobile stacked table layout. Follow-up evidence UX fix added micro problem previews directly inside finding cards, `Problem crop` PNGs for blank-region/overlap findings, `Open exact screenshot`, `Gallery card` anchor links, and regeneration of old history dashboards so earlier `Screenshot contains a large blank region` pages no longer use the old hidden-link UX. Local dashboard pages were regenerated; no GitHub Pages push yet. |

## Agent Self-Checks

| Status | Check | Owner | Last Checked | Notes |
| --- | --- | --- | --- | --- |
| self-checked | TypeScript validation passes. | assistant | 2026-05-21 | `npm run typecheck` passed. |
| self-checked | GitHub workflow YAML parses. | assistant | 2026-05-21 | Ruby YAML parser loaded both workflow files. |
| self-checked | Dashboard generator still works. | assistant | 2026-05-21 | `npm run dashboard` passed. |
| self-checked | GitHub remote exists and initial commit is pushed. | assistant | 2026-05-21 | `main` tracks `origin/main`; CI passed on push. |
| self-checked | GitHub Pages deployment starts from `site-qa.yml`. | assistant | 2026-05-21 | Manual `monthly` workflow completed successfully. |
| self-checked | Fresh staging dashboard opens locally. | assistant | 2026-05-22 | `http://127.0.0.1:8787/reports/latest/dashboard.staging.html` returned HTTP 200. |
| self-checked | New remediation/dashboard changes pass local validation. | assistant | 2026-05-22 | `npm run typecheck`, YAML parse, full staging QA, and `npm run dashboard` passed. |
| self-checked | No local project subagent sessions are running. | assistant | 2026-05-22 | Checked `.agent-hub`, `screen`, relevant processes, and listening ports; only Codex internal helper/MCP processes were visible. |
| self-checked | Latest TypeScript validation passes. | assistant | 2026-05-22 | `npm run typecheck` passed after screenshot/date/dashboard schema changes. |
| self-checked | Latest staging screenshot QA run completes. | assistant | 2026-05-22 | `npm run qa -- --site staging --screenshots --screenshot-viewports mobile,desktop --screenshot-limit 6 --max-crawl-pages 40` completed with 12 screenshots and 16 findings. |
| self-checked | Latest all-sites health run completes. | assistant | 2026-05-22 | `npm run qa -- --site all --max-crawl-pages 80 && npm run dashboard` completed in run `2026-05-22T21-24-04-199Z-all` with 41 findings and historical report output. |
| self-checked | Historical screenshot artifact path works. | assistant | 2026-05-22 | `npm run qa -- --site staging --screenshots --screenshot-viewports mobile --screenshot-limit 1 --max-crawl-pages 5 && npm run dashboard` created `artifacts/history/2026-05-22T21-24-55-964Z-staging/screenshots/...`. |
| self-checked | Workflow YAML still parses. | assistant | 2026-05-22 | Ruby YAML parser loaded `ci.yml`, `site-qa.yml`, and `device-cloud.yml`. |
| self-checked | Durable storage manifest validation. | assistant | 2026-05-22 | `npm run typecheck`, workflow YAML parse, and `npm run dashboard` passed; manifest JSON inspected successfully. |
| self-checked | R2/S3 sync adapter validation. | assistant | 2026-05-22 | `npm run typecheck`, workflow YAML parse, `npm run sync:history -- --dry-run`, and no-secret skip check passed. |
| self-checked | HTML vs Markdown consistency validation. | assistant | 2026-05-22 | `npm run qa -- --site staging --max-crawl-pages 8`, `npm run dashboard`, `npm run typecheck`, and manifest dry-run passed. |
| self-checked | CMS contract preflight validation. | assistant | 2026-05-24 | `node --import tsx src/cli/check-cms-contract.ts --dry-run`, `npm run typecheck`, and workflow YAML parse passed; live Sanity query remains blocked on env/secrets. |
| self-checked | Latest staging health run completes. | assistant | 2026-05-27 | `node --import tsx src/cli/run.ts --site staging --max-crawl-pages 80`, `node --import tsx src/dashboard/generate.ts`, and `npm run typecheck` passed. Latest run `2026-05-27T03-04-04-061Z-staging` checked 20 pages, found 14 issues, and newly re-confirmed `/sprint-pos` as a live high-severity 404. |
| self-checked | AI Native visual QA local run completes. | assistant | 2026-06-12 | `npm run typecheck`, `npm run qa:ai-native`, and `npm run dashboard` passed. Local dashboard URLs returned HTTP 200, chooser kept production/staging/ai-native visible, and all 8 AI Native image URLs returned `200 image/png`. |
| self-checked | Expanded AI Native browser/viewport visual QA validates locally. | assistant | 2026-06-12 | `npm run typecheck`, `npm run qa:ai-native`, and `npm run dashboard` passed after installing Playwright Firefox/WebKit. Local dashboard URLs returned HTTP 200; browser verification found 94 inline evidence thumbnails, 316 gallery screenshots, and a loaded 1280x800 evidence preview labeled `chromium / laptop-13 / agent-company`. |
| self-checked | Redesigned QA dashboard validates on desktop and mobile. | assistant | 2026-06-13 | `npm run typecheck` and `npm run dashboard` passed. Local preview returned HTTP 200 for `dashboard.html` and `dashboard.ai-native.html`. Playwright checked 1440x1000 and 390x844: horizontal overflow `0`, gallery count `316`, suspicious cards `93`, first evidence image loaded, and mobile tables stack instead of widening the viewport. |
| self-checked | Finding-card evidence previews validate for old blank-region and current overlap reports. | assistant | 2026-06-13 | `npm run typecheck` and full `npm run dashboard` passed after adding backward-compatible history regeneration. Old history run `2026-06-12T20-03-52-258Z-ai-native` now has `Problem crop: blank region` previews for `finding_007` and `finding_008`; Playwright checked `#finding_007` on desktop/mobile with horizontal overflow `0`, loaded crop image, visible links `Problem crop`, `Open exact screenshot`, `Gallery card`, `Scroll retry`, and `Baseline`. Latest run has 94 generated crop PNGs for finding evidence. |

## Approved / Closed

No closed items yet in this publication cycle.
