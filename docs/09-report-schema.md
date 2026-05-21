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

## Artifact Types

- `html-report`;
- `json-report`;
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
