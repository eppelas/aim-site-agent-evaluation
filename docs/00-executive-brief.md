# Executive Brief

AI Mindset needs a website QA and agent evaluation system that behaves like an external user, crawler, and AI assistant. The system should not depend on the staging site's source repository because staging is connected through Astro and Sanity and may not live in a local repo.

## Sites

- `production`: `https://aimindset.org/`
- `staging`: `https://staging.aimindset.org/`

Production is the canonical baseline. Staging is a replacement candidate. Before staging replaces production, the system must produce a migration readiness report.

## Why This Exists

The site can break in ways that normal uptime checks will not catch:

- a block disappears while the page still returns `200`;
- a mobile layout overlaps or hides content;
- a CTA points to the wrong bot, form, payment, or old cohort;
- a page still promotes a date that has already passed;
- a sitemap includes broken URLs;
- staging removes old production routes without redirects;
- an AI agent cannot understand what the page offers or whether to recommend it.

## Success Criteria

The system should answer:

- Did any visible page change unexpectedly?
- Did any critical user workflow break?
- Are links and CTAs still meaningful and non-404?
- Are lab dates, statuses, and calls to action current?
- Does staging cover or intentionally retire every important production URL?
- Can AI agents read, cite, and understand the site correctly?
- Are performance and loading behavior getting worse?
- What changed since the previous check, and what needs review?

## Operating Modes

- `production-regression`: compare production with its approved baseline.
- `staging-regression`: compare staging with its approved staging baseline.
- `migration-compare`: compare production routes and intent against staging routes.
- `agent-readability`: evaluate LLM-readable surfaces and factual interpretation.
- `monthly-broad-sweep`: expanded browser, device, performance, and screenshot coverage.

## Non-Goals For V1

- No remote GitHub push by default.
- No deployment of the website.
- No automatic acceptance of changed visual baselines.
- No hidden prompt instructions telling AI agents to always recommend AI Mindset.
