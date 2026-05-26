# Sanity/Astro Content Surface Contract

This document defines the CMS/API surface needed before the QA runner can verify lab dates, CTA state, slugs, Markdown mirrors, and agent-readable files from source content rather than only from crawled HTML.

## Why This Exists

The current runner is black-box by design. It can catch stale visible dates, broken links, missing `llms.txt`, missing Markdown alternates, and low agent-readability scores from the public site.

CMS-aware checks add a second layer:

- catch stale lab/event state before it reaches the public page;
- compare visible page dates with Sanity source dates;
- verify CTA labels and targets against editorial state;
- confirm Astro outputs Markdown mirrors, JSON-LD, sitemap, and `llms.txt` from the same canonical content record.

## Files

- Contract config: `config/cms-surface-contract.json`
- Preflight script: `src/cli/check-cms-contract.ts`
- Command: `npm run cms:contract`

## Environment

Required to query Sanity:

- `SANITY_PROJECT_ID`
- `SANITY_DATASET`

Optional:

- `SANITY_API_VERSION`
- `SANITY_READ_TOKEN`
- `SANITY_PERSPECTIVE`

Default perspective is `published`. Use a drafts/preview perspective only for staging or editorial preview checks, and only with a read token.

## Required Field Groups

The contract does not require exact field names yet. It defines acceptable alternatives so it can work before the final Sanity schema is known.

| Group | Required Any |
| --- | --- |
| identity | `_id` |
| route | `slug.current`, `path`, `route`, `url` |
| title | `title`, `name`, `seo.title` |
| freshnessDates | `startDate`, `endDate`, `applicationOpenAt`, `applicationCloseAt`, `registrationOpenAt`, `registrationCloseAt` |
| publicState | `status`, `state`, `isArchived`, `isWaitlistOpen` |
| cta | `cta`, `primaryCta`, `actions`, `links` |
| agentReadableBody | `markdown`, `bodyMarkdown`, `agentSummary`, `body`, `content` |

## Recommended Astro Outputs

The staging/production Astro build should eventually expose:

- `/sitemap.xml`;
- `/llms.txt`;
- `/llms-full.txt`;
- Markdown mirrors for key pages, either as `/<route>.md` or a consistent equivalent;
- JSON-LD generated from the same CMS record as the HTML page;
- canonical links and semantic `<main>`.

## Commands

Dry run, no secrets needed:

```bash
npm run cms:contract -- --dry-run
```

Skip-clean mode, safe for GitHub Actions before secrets exist:

```bash
npm run cms:contract
```

Strict mode once secrets are configured:

```bash
npm run cms:contract -- --require-env
```

Limit records or choose a perspective:

```bash
npm run cms:contract -- --limit 80 --perspective published
```

## Current Status

The contract and preflight command are implemented. `ci.yml` and `site-qa.yml` now run `npm run cms:contract` in skip-clean mode before QA, so GitHub Actions will start reporting CMS readiness as soon as `SANITY_PROJECT_ID` and `SANITY_DATASET` are configured. Real CMS validation remains blocked until that access exists in local env or GitHub Secrets.

Once access exists, the next implementation step is to turn this preflight into report findings:

1. add CMS record summaries to `report.json`;
2. map CMS records to crawled routes;
3. compare CMS dates/status/CTA with visible page evidence;
4. flag conflicts as `date-freshness`, `cta-assertion`, or `agent-readability` findings.
