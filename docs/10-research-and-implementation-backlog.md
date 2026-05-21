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

## Immediate Next Implementation

| Status | Area | Task |
| --- | --- | --- |
| next | Link intent checks | Add live external destination status checks and CTA-specific assertions. |
| next | Agent-readability checks | Add per-page scoring and HTML vs Markdown consistency checks. |
| next | Date freshness V1 | Convert date tokens into normalized dates and flag stale lab starts against current date. |
| next | Migration compare V1 | Add visual/content similarity checks per mapped route. |
| partial | Screenshot manifest | Stores screenshot byte size, hash, and baseline status; dimensions/blank-pixel checks still needed. |
| next | DeviceCloud workflow | Add optional GitHub Actions job that skips cleanly until provider secrets exist. |

## Focused Research Still Needed

| Status | Research Topic | Decision Needed |
| --- | --- | --- |
| research | Arc/Yandex/Telegram browser automation | Which provider or local/manual flow can realistically cover these browsers? |
| research | DeviceCloud provider fit | Confirm BrowserStack vs LambdaTest/TestMu AI vs Sauce Labs against our concrete browser/device matrix. |
| research | Sanity/Astro content surfaces | Which API/schema fields expose labs, dates, CTA state, and markdown content? |
| research | Visual vendor | Percy vs Argos vs Applitools: cost, full-page support, baseline approval, GitHub UX. |
| research | Artifact storage | Google Drive vs Cloudflare R2/S3 + Supabase/SQLite for history and dashboard. |
| research | AI visibility vendor | Otterly vs AthenaHQ vs Scrunch vs Lumar for AI search and citation tracking. |
| research | Analytics source | GA/Plausible/Cloudflare logs access for real browser/device prioritization. |
| research | Markdown mirror generation | Best Sanity/Astro implementation path for `.md` pages and `/llms.txt`. |

## Blocked By Access Or Product Decisions

| Status | Area | Blocker |
| --- | --- | --- |
| blocked | Sanity-aware freshness | Needs Sanity project ID/API token or exported schema/content. |
| blocked | Google Drive screenshot archive | Needs folder/access pattern or service account/OAuth decision. |
| blocked | BrowserStack real-device runs | Needs account/API credentials and plan decision. |
| blocked | Checkly hosted monitoring | Needs account/API token and whether monitors should be managed by code. |
| blocked | AI visibility tracking | Needs vendor choice and billing decision. |

## Recommended Next Milestones

1. **V0.6 Screenshot Manifest**: dimensions, byte size, blank-image detection.
2. **V0.7 CTA Assertions**: expected destination patterns for primary CTAs.
3. **V0.8 Freshness Rules**: normalized dates plus lab status rules.
4. **V0.9 Agent Scoring**: repeatable LLM questions with source-grounded answers.
5. **V1 Hosted Automation**: GitHub Actions active after repo is pushed; then Checkly/Percy/BrowserStack decisions.
