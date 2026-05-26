# Visual and Workflow QA

## Visual Regression

Capture full-page screenshots for all discovered pages and key viewports.

Core viewports:

- `360x800`;
- `390x844`;
- `414x896`;
- `768x1024`;
- `820x1180`;
- `1366x768`;
- `1536x864`;
- `1920x1080`.

Monthly viewports:

- `393x873`;
- `1280x800`;
- `1440x900`;
- `2560x1440`.

## What Visual QA Should Catch

- missing page blocks;
- blank hero/canvas/video/animation areas;
- overlapping text;
- sticky header/sidebar covering content;
- mobile menu not opening;
- CTA hidden below broken layout;
- images not loading;
- font fallback changing layout;
- full-page height unexpectedly shrinking;
- visual loading stuck in skeleton/placeholder state.

## Diff Policy

Categories:

- `potential-breakage`: likely unintended missing or broken visual behavior.
- `intentional-change-needs-review`: visible change that may be design/content work.
- `screenshot-only`: stored for manual review, not a failure.
- `accepted`: manually approved as the new baseline.

Baselines must be updated manually.

## Baseline Policy

The first screenshot run cannot honestly perform visual regression, because there is nothing approved to compare against.

Baseline behavior:

- If no baseline screenshot exists for `site + viewport + URL`, save the current screenshot as the initial baseline.
- Mark the artifact as `baseline-created`.
- Do not call this a pass or fail.
- On the next run, compare the current screenshot with the saved baseline.
- If the screenshot differs beyond the configured pixel threshold, create a `screenshot` finding with status `changed`.
- A human must review changed screenshots and decide whether to accept a new baseline or treat it as a regression.

Current V0 comparison uses local pixel diff:

- exact PNG hash match returns `matched` immediately;
- otherwise the runner creates a `diff.png`;
- `pixelmatch` threshold: `0.15`;
- finding threshold: more than `1%` of pixels and more than `2500` pixels differ;
- image size differences are normalized onto a white canvas before diffing.

This is more useful than hash-only comparison, but it is still not as smart as Percy, Argos, or Applitools. Dynamic blocks, animations, embedded widgets, and time-sensitive content may still need masking or vendor visual AI.

## Large Blank Region Review

Full-page screenshots are captured raw first: the runner loads the page, waits for normal browser readiness, and saves the screenshot without scrolling through the page to force lazy content.

If the raw screenshot contains a mostly empty vertical band of at least `600px`, the runner creates a `screenshot` finding and then performs one diagnostic recapture:

1. Scroll through the page in viewport-sized steps.
2. Wait briefly for lazy sections, embeds, and images to settle.
3. Scroll back to the top.
4. Save a second screenshot with `.scroll-settle.png` in the filename.

Interpretation:

- `resolved-after-scroll`: the blank block disappeared after the diagnostic scroll. Treat this as a lazy-load/readiness issue or screenshot-timing risk, not yet proof that the live page is permanently broken.
- `still-blank-after-scroll`: the blank block remained after the diagnostic scroll. Treat this as a likely real visual/content problem in that viewport.
- `failed`: the diagnostic retry could not complete. Review the original screenshot and browser logs.

Important policy: do not force the lazy-scroll path for every screenshot. It would hide the initial user-visible loading state and make the first screenshot less honest. The scroll-settle capture is only a second artifact for screenshots that already look suspicious.

## Workflow QA

The workflow crawler should:

- visit every discovered internal page;
- click every meaningful visible link and button;
- open desktop dropdowns;
- open mobile menus;
- expand FAQ and review accordions;
- test anchors and hash navigation;
- test CTA links to Telegram, Tally, BotHelp, payment, waitlist, policy, YouTube, podcast, and docs;
- report redirects, 404s, 5xx, unexpected hosts, and empty destination pages.

## CTA Destination Rules

Expected destination examples:

- Telegram community: `t.me` or configured invite/bot URL.
- Telegram bot: configured bot path and start parameter.
- Tally form: `tally.so/r/...`.
- BotHelp: `r.bothelp.io/tg?...`.
- Policy and offer: production canonical document or published Google Doc.
- YouTube: official AI Mindset channel or configured video URL.
- Payment/waitlist: configured payment or waitlist host.

V1 implementation:

- CTA rules live in `config/cta-rules.json`.
- Rules match the visible link text, not the whole surrounding section, to avoid classifying unrelated footer/card links as CTAs.
- Each rule declares expected intents, optional allowed hosts, HTTPS requirements, severity, and owner.
- Findings include source page, source anchor when available, link text, section, target URL, and the matched rule.
- Current useful signal: production application-form CTAs that route through `google.com/url?...` are flagged as unknown workflow destinations.

## Evidence

For every failure, store:

- current URL;
- clicked element text and selector;
- target URL;
- HTTP status;
- screenshot;
- trace if browser workflow failed;
- severity and suggested owner.

For large blank regions, also store:

- blank region y-range;
- blank region height;
- dominant/unique color metrics for the blank rows;
- original screenshot path;
- scroll-settle retry screenshot path, if created;
- retry status.
