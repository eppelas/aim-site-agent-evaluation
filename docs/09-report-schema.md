# Report Schema

Reports should be both human-readable and machine-readable.

## Run Object

```json
{
  "runId": "2026-05-21T150000Z-production-biweekly",
  "startedAt": "2026-05-21T15:00:00Z",
  "finishedAt": "2026-05-21T15:21:00Z",
  "environment": "production",
  "mode": "production-regression",
  "status": "warning",
  "summary": {
    "routesChecked": 27,
    "findingsTotal": 6,
    "critical": 0,
    "high": 2,
    "medium": 3,
    "low": 1
  }
}
```

## Finding Object

```json
{
  "id": "finding_001",
  "runId": "2026-05-21T150000Z-production-biweekly",
  "environment": "production",
  "url": "https://aimindset.org/new-site",
  "checkType": "link-crawl",
  "severity": "high",
  "status": "needs-review",
  "title": "Sitemap URL returns 404",
  "description": "The production sitemap includes a URL that returns 404.",
  "expected": "Sitemap URLs should return 200 or be removed/redirected.",
  "actual": "HTTP 404",
  "remediation": {
    "owner": "content",
    "summary": "Fix the CMS/content links that point users to this dead route, or create a redirect/page for the old path.",
    "steps": [
      "Open the source references and find the visible block or CTA containing the broken href.",
      "If the destination was renamed, replace the href with the current live route.",
      "If the old path is still expected publicly, add a route or redirect and rerun QA."
    ]
  },
  "evidence": {
    "screenshot": null,
    "trace": null,
    "responseStatus": 404,
    "artifactUrls": []
  }
}
```

## Status Values

- `planned`;
- `running`;
- `passed`;
- `warning`;
- `failed`;
- `changed`;
- `needs-review`;
- `accepted`;
- `archived`.

## Severity Values

- `critical`;
- `high`;
- `medium`;
- `low`;
- `info`.

## Check Types

- `visual-regression`;
- `workflow`;
- `link-crawl`;
- `date-freshness`;
- `performance`;
- `browser-device`;
- `agent-readability`;
- `structured-data`;
- `sitemap`;
- `migration-compare`;
- `prompt-injection`.

## External Target Check Object

External target checks are used for links where HTTP reachability is not enough. Event and registration links must also be checked for semantic freshness.

```json
{
  "siteId": "production",
  "targetUrl": "https://luma.com/pitch_lab",
  "intent": "event",
  "sourceUrls": ["https://aimindset.org/"],
  "status": 200,
  "freshnessStatus": "past",
  "dateSignals": [
    {
      "label": "startDate",
      "value": "2026-02-21T10:00:00.000+00:00",
      "source": "json-ld"
    }
  ]
}
```

## CTA Assertion Finding Evidence

CTA assertion findings are generated from `config/cta-rules.json` when visible link text promises one workflow but the target does not match the configured intent/host/security rule.

```json
{
  "checkType": "cta-assertion",
  "title": "CTA destination does not match expected workflow",
  "evidence": {
    "rule": {
      "id": "application-form-cta",
      "expectedIntents": ["form", "payment", "telegram", "telegram-bot-routing"]
    },
    "sourceUrl": "https://aimindset.org/research",
    "targetUrl": "https://www.google.com/url?sa=E&q=https%3A%2F%2Fknowledge.aimindset.org%2Fnon-profit",
    "linkText": "Подробное описание условий и форма подачи заявки для non-profit и art",
    "section": "## FAQ",
    "sourceAnchorUrl": "https://aimindset.org/research#faq"
  }
}
```

## Agent Surface Object

Each successful HTML page check includes `agentSurface.readability`.

```json
{
  "agentSurface": {
    "hasCanonical": false,
    "markdownAlternates": [],
    "llmsLinks": [],
    "sitemapLinks": [],
    "jsonLdCount": 0,
    "hasMain": false,
    "h1Count": 8,
    "hasMetaDescription": true,
    "readability": {
      "score": 10,
      "maxScore": 100,
      "percent": 10,
      "grade": "poor",
      "passed": ["meta-description"],
      "gaps": [
        "Missing canonical URL.",
        "Expected one H1, found 8.",
        "Missing semantic <main> wrapper.",
        "Missing JSON-LD structured data.",
        "Missing text/markdown alternate link.",
        "Missing discoverable llms.txt link in HTML head."
      ]
    }
  }
}
```

If a page exposes Markdown alternates, the page check also includes `markdownMirrors`.

```json
{
  "markdownMirrors": [
    {
      "url": "https://example.com/index.md",
      "finalUrl": "https://example.com/index.md",
      "status": "matched",
      "httpStatus": 200,
      "ok": true,
      "contentType": "text/markdown",
      "similarityPercent": 82,
      "htmlWordCount": 1200,
      "markdownWordCount": 1180,
      "sharedTopTerms": ["lab", "agents", "practice"],
      "htmlOnlyTopTerms": ["faq"],
      "markdownOnlyTopTerms": ["summary"],
      "htmlH1Texts": ["AI Mindset Lab"],
      "markdownH1Texts": ["AI Mindset Lab"]
    }
  ]
}
```

Mirror checks are generated only when `agentSurface.markdownAlternates` is non-empty. Missing alternates remain an agent-readability surface gap rather than a mirror mismatch.

## Migration Similarity Object

Mapped production/staging routes include content similarity evidence when both pages are reachable.

```json
{
  "productionPath": "/",
  "stagingPath": "/",
  "status": "content-mismatch",
  "contentSimilarity": {
    "percent": 8,
    "grade": "low",
    "titleSimilarity": 0,
    "headingSimilarity": 6,
    "termSimilarity": 10,
    "productionTitle": "AI Mindset",
    "stagingTitle": "AI Mindset",
    "productionTopTerms": ["mindset", "lab"],
    "stagingTopTerms": ["mindset", "systems"],
    "sharedTopTerms": ["mindset"],
    "productionHeadings": ["AI Mindset"],
    "stagingHeadings": ["AI Mindset"]
  }
}
```

## Artifact Types

- `html-report`;
- `json-report`;
- `storage-manifest`;
- `full-page-screenshot`;
- `visual-diff`;
- `baseline-screenshot`;
- `playwright-trace`;
- `video`;
- `har`;
- `lighthouse-report`;
- `webpagetest-filmstrip`;
- `crawler-export`;
- `markdown-extraction`;
- `llm-eval-output`.

## Screenshot Artifact Fields

Screenshot artifacts include byte/hash metadata, baseline comparison data, and image sanity checks.

```json
{
  "siteId": "staging",
  "url": "https://staging.aimindset.org/",
  "viewport": { "name": "desktop", "width": 1440, "height": 900 },
  "filePath": "artifacts/latest/screenshots/staging/desktop/page.png",
  "baselineStatus": "matched",
  "byteSize": 123456,
  "sha256": "...",
  "image": {
    "width": 1440,
    "height": 5400,
    "nonWhiteRatio": 0.21,
    "dominantColorRatio": 0.42,
    "uniqueColorCount": 1200,
    "isProbablyBlank": false,
    "largestBlankRegion": {
      "startY": 4013,
      "endY": 4697,
      "height": 685,
      "averageDominantColorRatio": 1,
      "averageUniqueColorCount": 1
    },
    "blankRegions": [
      {
        "startY": 4013,
        "endY": 4697,
        "height": 685,
        "averageDominantColorRatio": 1,
        "averageUniqueColorCount": 1
      }
    ],
    "blankRegionThresholdPx": 600
  },
  "blankRegionRetry": {
    "strategy": "scroll-settle-recapture",
    "status": "still-blank-after-scroll",
    "filePath": "artifacts/latest/screenshots/staging/mobile/page.scroll-settle.png"
  }
}
```

If `isProbablyBlank` is true, the run should create a high-severity screenshot finding because a visually empty page is usually a release blocker.

## Storage Manifest Object

`npm run dashboard` writes storage manifests for future durable history sync. These files are not an uploader; they are a contract for a later R2/S3-compatible adapter.

```json
{
  "generatedAt": "2026-05-22T21:30:00.000Z",
  "manifestVersion": 1,
  "scope": "history",
  "storage": {
    "currentLocalStorage": "GitHub Pages + GitHub Actions artifacts",
    "durableStorageStatus": "planned",
    "recommendedProvider": "cloudflare-r2-s3-compatible",
    "baseKey": "aim-site-agent-evaluation",
    "retention": {
      "reports": "24 months",
      "screenshots": "12 months"
    },
    "futureEnvVars": ["QA_HISTORY_S3_BUCKET"],
    "notes": ["Use destinationKey as the stable object key."]
  },
  "runCount": 2,
  "runIds": ["2026-05-22T21-24-55-964Z-staging"],
  "fileCount": 12,
  "totalBytes": 1024000,
  "files": [
    {
      "relativePath": "reports/history/2026-05-22T21-24-55-964Z-staging/report.json",
      "kind": "report-json",
      "runId": "2026-05-22T21-24-55-964Z-staging",
      "byteSize": 123456,
      "sha256": "...",
      "destinationKey": "aim-site-agent-evaluation/reports/history/2026-05-22T21-24-55-964Z-staging/report.json"
    }
  ]
}
```

Valid `kind` values:

- `report-json`;
- `report-summary`;
- `report-dashboard`;
- `history-index`;
- `history-index-json`;
- `storage-manifest`;
- `screenshot`;
- `visual-diff`;
- `scroll-retry-screenshot`.

If `largestBlankRegion` exists, the run should create a screenshot finding unless the URL itself already failed HTTP checks. The original screenshot remains the primary evidence. `blankRegionRetry` is a diagnostic second capture that only runs after a suspicious blank band is found.
