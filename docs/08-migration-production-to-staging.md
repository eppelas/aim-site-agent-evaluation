# Production to Staging Migration

Production is the canonical site until staging passes migration readiness.

## Goals

The migration report should show:

- every important production page;
- the intended staging equivalent;
- pages intentionally retired;
- missing staging pages;
- required redirects;
- visual/content differences;
- broken or changed CTA behavior.

## Route Statuses

- `mapped-ok`: production URL has a staging equivalent and the current semantic similarity check is acceptable.
- `content-mismatch`: mapped pages exist but their headings/top terms/title look too different for a safe automatic migration decision.
- `staging-missing`: no staging equivalent exists yet.
- `production-broken`: production URL in the migration map is already broken.
- `retired`: intentionally removed; needs redirect or archive decision.
- `redirect-needed`: old URL needs production redirect after launch.
- `manual-review`: ambiguous mapping.

## Content Similarity V1

The migration report now compares mapped production/staging pages by lightweight semantic fingerprints:

- page title token overlap;
- heading token overlap;
- visible-text top-term overlap.

The dashboard stores and displays:

- similarity percent;
- grade: `high`, `medium`, `low`, or `unknown`;
- shared top terms;
- production/staging titles and heading samples in `report.json`.

Current threshold:

- below `18/100` becomes `content-mismatch` for mapped routes;
- manual-review routes still show similarity evidence but remain manual-review.

Latest local signal:

- production `/` to staging `/` scored `8/100` and is flagged as `content-mismatch`;
- `/ai-mindset-community` to `/space/`, `/ai-mindset-consulting` to `/for-teams/`, `/research` to `/research/`, and `/garden` to `/garden/` scored high similarity;
- `/ai-mindset-lab-x26` to `/labs/w26-main-lab/` scored low similarity but remains manual-review because the mapping decision is already ambiguous.

## Current Production Sources

Production has a sitemap:

- `https://aimindset.org/sitemap.xml`

Known production sitemap URLs currently returning 404 during planning:

- `/ai-mindset-lab`;
- `/job-human-assistant`;
- `/new-lab-ai`;
- `/new-site`;
- `/sprint-pos/sprint-calendar-march-2026-4`.

These should be classified as either cleanup, redirect, archive, or expected retired URLs.

## Current Staging Sources

Staging currently has no sitemap.

Seed routes observed from staging navigation:

- `/`;
- `/space/`;
- `/for-teams/`;
- `/non-profit/`;
- `/research/`;
- `/garden/`;
- `/labs/s26-summer-lab/`;
- `/labs/summer-main-lab/`;
- `/labs/health-sprint/`;
- `/labs/spring-main-lab/`;
- `/labs/s26-spring-lab/`;
- `/labs/test-w26-main-lab/`;
- `/labs/w26-main-lab/`.

Known staging gaps:

- `/automation-lab`;
- `/sprint-pos`;
- `/labs/w26`.

Known staging canonicalization issue:

- lab URLs without trailing slash redirect to trailing slash through an odd `http://.../` location.

## Launch Readiness Checklist

- Production sitemap cleaned or redirect plan created.
- Staging sitemap exists.
- All production routes mapped or intentionally retired.
- Critical CTA paths verified.
- Canonicals point to final production URLs.
- Old URLs redirect to new URLs.
- Visual comparison reviewed.
- Agent-readable markdown and `llms.txt` are present.
- Date freshness checks pass.
- Browser/device broad sweep passes.
