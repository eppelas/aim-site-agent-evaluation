# Research and Implementation Backlog

This document tracks what is done, what is partially done, and what should be researched or implemented next.

## Status Legend

- `done`: implemented or researched enough for current scope.
- `partial`: usable first version exists, but deeper work remains.
- `next`: should be implemented soon.
- `research`: needs a focused research pass before implementation.
- `blocked`: needs access, credentials, vendor decision, or product decision.

## Implemented

| Status | Area | Notes |
| --- | --- | --- |
| done | Documentation repository | Created local repo and docs package. |
| done | Production/staging config | `config/sites.json`, route configs, browser matrix. |
| done | V0 route discovery | Production sitemap + crawl; staging seed + crawl. |
| done | V0 HTTP health checks | Status, redirects, 404/400/5xx, surface files. |
| done | V0 screenshot capture | Chromium full-page screenshots with mobile/desktop smoke. |
| done | V0 reports | `reports/latest/report.json` and `summary.md`. |
| done | Scheduled workflow config | GitHub Actions workflow for manual, biweekly, monthly runs. |
| done | Static dashboard V0 | `reports/latest/dashboard.html` with summary, findings, screenshots, links, dates, migration. |
| done | Agent-readability V0 | Aggregated checks for Markdown alternates, `llms.txt` links, JSON-LD, canonical, semantic main. |
| done | Link intent inventory V0 | Classifies external links into Telegram, forms, docs, YouTube, podcast, waitlist, related site, unknown. |
| done | Migration mapping V0 | `config/migration-map.json` and production-to-staging status table. |
| done | Date token inventory V0 | Extracts visible date-like tokens for freshness review. |
| done | DeviceCloud plan V0 | Added provider plan and desired coverage matrix. |
| done | Split dashboard V1 | Generates separate production and staging dashboards plus index page. |
| done | Broken-link source evidence V1 | Findings include sitemap/config/page source references, link text, and section/anchor when available. |
| done | External event freshness V1 | Event targets are fetched and fail if structured start/end dates are already past. |
| done | Screenshot baseline V0 | First screenshot run creates baselines; later runs compare against saved baselines. |
| done | Pixel diff V1 | Screenshot comparison now writes diff images and only flags changes above pixel thresholds. |
| done | Actionable remediation V1 | Findings now include recommended owner and next steps; dashboard and summary render them. |
| done | Screenshot sanity V1 | Screenshot artifacts include PNG dimensions, sampled color stats, and blank-image detection. |
| done | Screenshot blank-region diagnostics V1 | Full-page screenshots are raw-first; a scroll-settle retry runs only after a 600px+ blank band is detected. |
| done | Visible date freshness V1 | Visible page dates are normalized and stale active agenda dates create `date-freshness` findings. |
| done | DeviceCloud decision brief V1 | BrowserStack, TestMu AI/LambdaTest, Sauce Labs, and local Playwright were compared with current public pricing. |
| done | CTA assertions V1 | Config-driven CTA rules flag mismatches between visible link text and expected workflow destination. |
| done | Agent-readability scoring V1 | Each HTML page now gets a 0-100 agent-readability score and dashboard table. |
| done | DeviceCloud workflow shell V1 | GitHub Actions preflight workflow skips cleanly until provider secrets and adapter are ready. |
| done | Migration compare V1 | Mapped production/staging routes now include title, heading, and top-term similarity evidence. |
| done | Historical dashboard storage V1 | Runs are archived under `reports/history/<runId>` and screenshot artifacts under `artifacts/history/<runId>`. |
| done | Durable storage manifest V1 | `reports/latest/storage-manifest.json`, `reports/history/index.json`, and `reports/history/storage-manifest.json` describe files, sizes, SHA-256 hashes, and future object keys. |
| done | R2/S3 sync adapter shell V1 | `npm run sync:history` can dry-run manifests, skips without secrets, and uploads changed files when S3-compatible credentials exist. |
| done | HTML vs Markdown consistency V1 | Pages with Markdown alternates now fetch and compare mirror content against HTML fingerprints. |
| done | Sanity/Astro content contract preflight V1 | Added provider-neutral field contract, guarded `npm run cms:contract`, and GitHub Actions preflight wiring ahead of CMS-aware report findings. |

## Immediate Next Implementation

| Status | Area | Task |
| --- | --- | --- |
| done | Link intent checks | Add live external destination status checks and CTA-specific assertions. |
| partial | Agent-readability checks | Per-page scoring and HTML vs Markdown mirror consistency are implemented; factual LLM Q&A still remains. |
| done | Date freshness V1 | Convert date tokens into normalized dates and flag stale lab starts against current date. |
| done | Migration compare V1 | Add visual/content similarity checks per mapped route. |
| done | Screenshot manifest | Stores screenshot byte size, hash, dimensions, color sanity, and baseline status. |
| done | DeviceCloud workflow | Add optional GitHub Actions job that skips cleanly until provider secrets exist. |
| done | Historical dashboard storage | Add generated local/GitHub Pages history index and per-run dashboards. |
| done | Durable storage manifest | Add provider-neutral file manifest for future R2/S3-compatible history sync. |
| blocked | R2/S3 sync adapter credentials | Script exists; actual upload needs bucket creation and GitHub secrets. |
| blocked | HTML vs Markdown production signal | Consistency code exists, but current checked pages have no Markdown alternates to compare yet. |

## Focused Research Still Needed

| Status | Research Topic | Decision Needed |
| --- | --- | --- |
| done | Arc/Yandex/Telegram browser automation | Arc is local/manual; Yandex is manual/provider-specific until account verification; Telegram is WebView/Appium/manual, not ordinary Playwright browser automation. |
| done | DeviceCloud provider fit | Confirm BrowserStack vs LambdaTest/TestMu AI vs Sauce Labs against our concrete browser/device matrix. |
| partial | Sanity/Astro content surfaces | Contract and skip-clean preflight exist; live record validation and findings still need project env/secrets plus route mapping. |
| done | Visual vendor | Keep local pixelmatch first; choose Argos for hosted approvals, Percy if BrowserStack bundling matters, Applitools only if visual false positives justify enterprise cost. |
| partial | Artifact storage | Generated Pages history, upload manifests, and S3-compatible sync script exist; actual external sync needs bucket credentials. |
| done | AI visibility vendor | Do not buy yet; fix agent-readable surfaces first. Otterly is the cheapest visible first trial if monitoring becomes useful. |
| research | Analytics source | GA/Plausible/Cloudflare logs access for real browser/device prioritization. |
| research | Markdown mirror generation | Best Sanity/Astro implementation path for `.md` pages and `/llms.txt`; QA consistency checks are ready once mirrors exist. |

## Blocked By Access Or Product Decisions

| Status | Area | Blocker |
| --- | --- | --- |
| blocked | Sanity-aware freshness | Needs Sanity project ID/API token or exported schema/content. |
| blocked | Google Drive screenshot archive | Needs folder/access pattern or service account/OAuth decision. |
| blocked | BrowserStack real-device runs | Needs account/API credentials. Provider decision is BrowserStack first for automation. |
| blocked | Checkly hosted monitoring | Needs account/API token and whether monitors should be managed by code. |
| blocked | AI visibility tracking | Needs billing decision after agent-readable surfaces are fixed. Vendor shortlist is documented. |

## Recommended Next Milestones

1. **V0.7 CTA Assertions**: expected destination patterns for primary CTAs.
2. **V0.8 Freshness Rules**: add Sanity/CMS-aware lab status rules on top of visible date parsing.
3. **V0.9 Agent Scoring**: repeatable LLM questions with source-grounded answers.
4. **V1 DeviceCloud Probe**: optional BrowserStack/LambdaTest job that skips until secrets exist.
5. **V1 Historical Storage**: generated report/screenshot history plus durable upload manifests.
6. **V1.1 External Storage Setup**: create R2/S3 bucket, add secrets, and run the sync adapter once.
