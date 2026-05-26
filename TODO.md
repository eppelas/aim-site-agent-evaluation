# AIM Site Agent Evaluation TODO

This file is the working task list for the black-box QA/evaluation repo.

## Active Now

| Priority | Status | Task | Why It Matters | Next Step |
| --- | --- | --- | --- | --- |
| P0 | self-checked | Large blank-region screenshot detection | A page can be mostly rendered but still contain a 600px+ empty block where a widget, embed, image, or lazy section failed. | Implemented raw-first capture plus conditional `.scroll-settle.png` diagnostic retry only when a 600px+ blank band is found. |
| P0 | self-checked | Date Freshness V1 / Agenda Reliability Scoping | Pages and linked event targets can be reachable but stale, which is worse than a clean 404 for user trust. | Implemented visible date normalization, context snippets, and stale start/deadline/application/event findings. |
| P0 | self-checked | Verify stale external event links are visible in reports | External event freshness exists for `event` links, but staging-only latest run has no event targets. | Confirmed production Luma event freshness catches HTTP 200 past event and attaches source URL. |
| P1 | self-checked | DeviceCloud decision brief | Need browser/device coverage beyond local Chromium/Mac/iOS. | Updated DeviceCloud brief with BrowserStack, TestMu AI/LambdaTest, Sauce Labs, and local Playwright cost/fit comparison. |
| P0 | self-checked | CTA assertions | HTTP 200 is not enough; payment, bot, form, lab, and application buttons need expected destination patterns. | Implemented `config/cta-rules.json` and `cta-assertion` findings with source link evidence. |
| P1 | self-checked | Per-page agent-readability score | Aggregate site-level findings hide which pages are worst for agents. | Implemented 0-100 per-page scoring and dashboard table sorted worst-first. |
| P1 | self-checked | Optional DeviceCloud workflow | Keep GitHub Actions useful without paid secrets, but ready for real-device runs. | Added `.github/workflows/device-cloud.yml`; it checks secrets and skips before paid provider sessions. |
| P1 | self-checked | Migration compare V1 | Staging replacing production needs mapped route parity, not only route status. | Implemented title, heading, and top-term similarity for mapped production/staging routes. |
| P2 | self-checked | Historical dashboard storage | `latest` is useful, but we need trend/history to compare runs over time. | Implemented generated history index, per-run dashboards, per-run reports, and per-run screenshot artifact paths. |
| P2 | self-checked | Durable storage manifest | GitHub Pages history is useful, but long-term screenshot/report history needs an upload contract before external storage is connected. | Added `config/history-storage.json`; `npm run dashboard` now writes latest/history manifests with file kind, size, SHA-256, run ID, and destination key. |
| P2 | self-checked | R2/S3 sync adapter shell | Long-term history should be mirrorable outside GitHub Actions artifacts. | Added `npm run sync:history`; dry-run and no-secret skip behavior passed. |

## Next Implementation

| Priority | Status | Task | Why It Matters | Next Step |
| --- | --- | --- | --- | --- |
| P2 | blocked | R2/S3 external storage credentials | Sync script exists, but no external object-store upload can happen without bucket credentials. | Create R2/S3 bucket, add GitHub secrets, and run `site-qa.yml` once. |
| P2 | self-checked | HTML vs Markdown consistency checks | Agent-readability score can only check discoverability until Markdown mirrors exist. | Implemented mirror fetching/comparison for pages with Markdown alternates; latest staging smoke has no mirrors, so no mirror mismatch findings were created. |
| P1 | self-checked | Sanity/Astro content contract preflight | CMS-aware freshness and mirror checks need an explicit content/API contract before Sanity access exists. | Implemented `npm run cms:contract`, wired it into CI/site QA in skip-clean mode, and documented required fields/outputs. |

## Site Fixes Found By Current Runs

| Priority | Status | Site | Issue | Action |
| --- | --- | --- | --- | --- |
| P0 | open | staging | `/automation-lab` returns 404 but is linked from multiple pages. | Fix CMS links or create route/redirect. |
| P0 | open | staging | `/labs/w26` returns 404 but is linked from multiple pages. | Point links to live route, likely `/labs/w26-main-lab/`, or create redirect. |
| P0 | open | staging | `/sprint-pos` returns 404 from `/non-profit/`. | Fix link or create route/redirect. |
| P0 | open | staging | `/sitemap.xml` returns 404. | Generate sitemap before staging becomes production. |
| P1 | open | staging | `/llms.txt` and `/llms-full.txt` return 404. | Add agent-readable index files or adjust required-surface policy. |
| P1 | open | staging | Missing Markdown alternates, JSON-LD, canonicals, and `<main>` on checked HTML pages. | Fix shared Astro layout and metadata generation. |
| P1 | open | staging | Visual diffs on `/labs/w26-main-lab/` mobile/tablet. | Review current/baseline/diff screenshots and accept or fix. |
| P1 | open | staging | `/for-teams/` mobile screenshot has a 685px blank band that remains after scroll-settle retry. | Review the page in iPhone viewport and decide whether this is broken/missing content or intentional spacing. |
| P1 | open | staging | `/labs/s26-spring-lab/` has large blank bands that resolve after scroll-settle retry. | Treat as lazy-load/readiness risk; verify tariff/media sections load for first-time mobile and desktop users. |
| P1 | open | staging | `/garden/` contains past visible start dates `15 июля 2025` and `12 августа 2025`. | Update CTA/copy to archive, waitlist, next cohort, or current state. |
| P1 | open | staging | All checked HTML pages score below `50/100` for agent-readability. | Add canonical links, JSON-LD, Markdown alternates, `llms.txt`, and semantic `<main>`. |
| P1 | open | production | Application-form CTA routes through `google.com/url?...` on research pages. | Replace redirect-wrapper links with direct canonical destination URLs or true application forms. |
| P1 | open | migration | Production `/` to staging `/` scored `8/100` content similarity. | Review whether staging homepage is intended to replace the production homepage as-is or update the migration map/content. |

## Research Needed

| Priority | Status | Topic | Decision Needed |
| --- | --- | --- | --- |
| P1 | self-checked | BrowserStack vs LambdaTest vs Sauce Labs | Decision refreshed 2026-05-23: BrowserStack first for automation; LambdaTest/TestMu for low-cost/manual experiments; Sauce Labs as enterprise fallback. |
| P1 | self-checked | Arc/Yandex/Telegram automation | Decision refreshed 2026-05-23: Arc local/manual, Yandex manual/provider-specific until account verification, Telegram WebView/Appium/manual lane. |
| P1 | partial | Sanity/Astro content surfaces | Contract + preflight are defined; actual record validation and report findings still need Sanity env/secrets and route mapping. |
| P2 | self-checked | Visual testing vendor | Decision refreshed 2026-05-23: keep local pixelmatch first; choose Argos for first hosted approval layer, Percy if BrowserStack bundle matters, Applitools only if false positives justify enterprise cost. |
| P2 | self-checked | AI visibility monitoring | Decision refreshed 2026-05-23: do not buy yet; fix agent-readable surfaces first, then trial Otterly if monitoring becomes useful. |

## Done

| Status | Task | Notes |
| --- | --- | --- |
| done | Initial repo and docs | Created `AIM Site Agent Evaluation`. |
| done | GitHub repo and Pages | Published to `https://github.com/eppelas/aim-site-agent-evaluation` and GitHub Pages. |
| done | Scheduled GitHub Actions | CI plus manual/scheduled `site-qa.yml`. |
| done | Split production/staging dashboards | Separate dashboard HTML files generated. |
| done | Broken-link source evidence | Findings show source page, source anchor, href, link text, and section when available. |
| done | External event freshness V1 | Event targets with structured past dates produce date-freshness findings. |
| done | Screenshot baseline and pixel diff | Baselines, diffs, and changed screenshot findings exist. |
| done | Screenshot basic sanity metadata | Screenshots now include dimensions, color stats, and full-image blank detection. |
| done | Screenshot large blank-band diagnostics | Suspicious screenshots now get blank y-range findings and conditional scroll-settle retry artifacts. |
| done | Date Freshness V1 | Visible page dates are normalized and stale agenda dates create findings. |
| done | CTA assertions V1 | Config-driven rules check visible CTA text against expected target intent and host. |
| done | Agent-readability score V1 | Dashboard now shows per-page score, grade, passed checks, and gaps. |
| done | Optional DeviceCloud workflow shell | GitHub Actions workflow checks provider secrets and skips cleanly until real adapters exist. |
| done | Migration compare V1 | Mapped routes include similarity percent, grade, and shared top terms. |
| done | Historical dashboard storage V1 | Runs are archived under `reports/history/<runId>` and screenshot artifacts under `artifacts/history/<runId>`. |
| done | Durable storage manifest V1 | Dashboard generation writes `reports/latest/storage-manifest.json`, `reports/history/index.json`, and `reports/history/storage-manifest.json`. |
| done | R2/S3 sync adapter shell V1 | `npm run sync:history` can dry-run manifests, skip without secrets, and upload changed files when credentials exist. |
| done | HTML vs Markdown consistency V1 | Markdown alternates are fetched and compared against HTML fingerprints when present. |
| done | DeviceCloud decision brief | Added current provider comparison and recommendation in `docs/13-device-cloud-integration.md`. |
| done | Finding remediation hints | Findings include recommended owner and next steps. |
| done | Sanity/Astro content contract preflight | Added `config/cms-surface-contract.json`, `npm run cms:contract`, workflow preflight steps, and `docs/15-sanity-astro-content-contract.md`. |
