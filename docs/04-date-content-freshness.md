# Date and Content Freshness

The freshness checker protects against stale lab pages and misleading CTA states.

## Sources

Extract dates and state from:

- visible text;
- `<time datetime>`;
- JSON-LD;
- known DOM selectors;
- CMS/Sanity fields if API access is available;
- CTA text and target URLs.

## Normalization

Default timezone: `Europe/Lisbon`, unless a page or CMS field states another timezone.

The parser should support:

- Russian month names;
- English month names;
- date ranges;
- date-only values;
- application open and close windows;
- missing year warnings;
- timezone-aware datetime values.

## Normalized Statuses

- `not-yet-open`;
- `open`;
- `closing-soon`;
- `in-progress`;
- `past`;
- `waitlist`;
- `archived`;
- `cancelled`;
- `postponed`.

## Error Rules

Flag as error:

- CTA says apply/register but the start date is already past and there is no waitlist.
- External event/registration link returns HTTP 200 but the destination event `startDate`/`endDate` is already in the past.
- Page says current/open but normalized status is past.
- Start date is after end date.
- Required lab/event start date is missing.
- Visible date conflicts with structured/CMS date.
- Payment or application CTA points to an inactive/dead form.
- Sitemap or linked page promotes an old cohort as active.

## External Target Freshness Rule

Do not treat external CTA links as valid only because they return HTTP 200.

For links classified as `event`, the checker must fetch the destination page and inspect structured date signals such as JSON-LD `startDate` and `endDate`. If the event end date is before the run date, create a `date-freshness` finding.

Example regression captured from production:

- Source: `https://aimindset.org/`
- Target: `https://luma.com/pitch_lab`
- HTTP status: `200`
- Structured dates: `startDate=2026-02-21T10:00:00.000+00:00`, `endDate=2026-02-21T14:00:00.000+00:00`
- Run date: `2026-05-21`
- Expected result: failed freshness finding, because a live homepage CTA points to a past event.

## Visible Page Date Freshness V1

The checker also parses visible page text and normalizes likely dates into `dateSignals`.

Supported in V1:

- Russian day-month dates such as `15 июля 2025` and `13 мая`;
- English dates such as `May 13`, `13 May`, and versions with year;
- numeric dates such as `13.05.2026`;
- ISO dates such as `2026-05-13`.

For each date signal the report stores:

- raw date text;
- normalized ISO date when parseable;
- whether the year was assumed;
- `past`, `today`, `upcoming`, or `unknown`;
- inferred category: `start`, `deadline`, `application`, `event`, `cohort`, `archive`, or `generic`;
- context snippet from the page.

Actionable V1 rule:

- past `start`, `deadline`, `application`, or `event` dates on live HTML pages create a `date-freshness` finding;
- `archive`, legal, privacy, terms, offer, and generic historical contexts are not treated as blocking freshness failures;
- missing year is kept in evidence because it can create ambiguity.

Confirmed current examples:

- `https://staging.aimindset.org/garden/` contains past start dates: `15 июля 2025` and `12 августа 2025`.
- The production homepage links to `https://luma.com/pitch_lab`; the link is HTTP 200, but the destination event dates are already past, so the report marks it stale with the source page attached.

## Warning Rules

Flag as warning:

- date is visible but not machine-readable;
- date has no year;
- ambiguous date was resolved by locale policy;
- old archive page does not clearly identify itself as archive;
- page starts soon but CTA still says coming soon;
- structured data lacks end date where duration matters.

## Recommended CTA Matrix

| Status | Expected CTA |
| --- | --- |
| not-yet-open | Notify me, join interest list, learn more |
| open | Apply now, register |
| closing-soon | Apply now with urgency copy |
| in-progress | View schedule, contact us, join next cohort |
| waitlist | Join waitlist |
| past | View recap, watch recording, join next cohort |
| archived | No active enrollment CTA |

## Test Fixtures Needed

- `13 мая` with current date after May 13.
- Missing year on a lab page.
- Date range crossing month boundary.
- Open application window and past start date.
- Waitlist enabled after close.
- Archived cohort that should not trigger active CTA errors.
