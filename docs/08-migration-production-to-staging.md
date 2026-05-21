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

- `mapped`: production URL has a staging equivalent.
- `missing`: no staging equivalent exists yet.
- `retired`: intentionally removed; needs redirect or archive decision.
- `changed`: equivalent exists but content/intent changed significantly.
- `redirect-needed`: old URL needs production redirect after launch.
- `manual-review`: ambiguous mapping.

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
