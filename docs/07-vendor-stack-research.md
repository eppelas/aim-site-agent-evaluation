# Vendor Stack Research

This system should use a layered stack rather than rely on one tool.

## Synthetic Monitoring

### Checkly

Best first hosted layer for this project.

- Playwright-native monitoring.
- Scheduled browser checks.
- Multi-location runs.
- Alerts.
- Monitoring-as-code.

### Datadog Synthetics

Powerful if the team wants one observability platform, but likely more expensive.

### Grafana Cloud Synthetic Monitoring

Good if the team already wants Grafana/k6-style observability.

### Better Stack

Useful for simpler uptime, status page, and incidents.

## Visual Regression and Visual AI

### Percy

Practical visual diff review layer with BrowserStack ecosystem fit.

2026-05-23 check: Percy has a free entry tier with 5,000 screenshots/month and is strongest when BrowserStack is already the device-cloud provider. Use it if we want one vendor relationship for BrowserStack + Percy.

### Argos

Lean visual testing with GitHub-friendly workflow.

2026-05-23 check: Argos is the best first hosted visual-review vendor for this repo if we want a small-team GitHub workflow and transparent pricing. Hobby includes up to 5,000 screenshots; Pro starts at `$100/month` with 35,000 screenshots and usage-based overage.

### Applitools

Strongest visual AI option for lower false positives and enterprise-grade cross-browser visual testing. Higher cost.

2026-05-23 check: Applitools is still the strongest enterprise visual-AI option, especially for dynamic content and cross-browser visual analysis, but pricing is sales-led. Do not start here unless local pixelmatch/Percy/Argos produces too many false positives.

### Chromatic

Best when a Storybook/component system exists.

Current recommendation: keep our local Playwright + pixelmatch screenshots as the baseline, then add Argos first if the team wants hosted approvals. Pick Percy instead if BrowserStack is selected and bundling matters. Pick Applitools only after false-positive pain is proven.

## Real Device Cloud

### BrowserStack

Preferred for this project:

- real iOS/Android devices;
- desktop browser coverage;
- Playwright support;
- session videos and logs.

Use as the first DeviceCloud integration target once credentials exist. Official docs cover GitHub Actions setup with `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`, Playwright capabilities, local testing tunnels, and real-device coverage. Keep the initial GitHub job separate from the main QA workflow so cloud flakiness or billing limits do not block local reporting.

### Sauce Labs / LambdaTest / TestingBot

Alternatives if pricing or browser availability is better.

LambdaTest/TestMu AI and Sauce Labs both have Playwright/CI documentation, but they should be evaluated against the concrete browser list in `config/device-cloud-matrix.json`, especially iOS Safari, Android Chrome, Samsung Internet, and whether any path exists for Yandex or Telegram in-app coverage.

## Performance and Loading

### DebugBear

Strong for Core Web Vitals, Lighthouse, RUM, CrUX, alerts, and small-team dashboards.

### SpeedCurve

Mature synthetic and RUM performance monitoring.

### WebPageTest

Best for filmstrips, waterfalls, visual loading diagnostics, and scripted performance checks.

### sitespeed.io

Self-hostable performance tooling with visual metrics and Grafana/Influx-style workflows.

## Technical Crawl and SEO Health

### Sitebulb Cloud

Guided audits, visual reports, JavaScript rendering, scheduled crawls.

### Screaming Frog SEO Spider

Best value and very deep crawl/export capabilities. Good for scheduled local or CI-style exports.

### Lumar / Conductor ContentKing

Enterprise continuous monitoring and change detection.

## AI Visibility and Agent Experience

### Otterly

Tracks brand visibility and citations across AI search surfaces.

2026-05-23 check: Otterly is the most accessible first AI-visibility trial because public pricing starts at `$29/month` for Lite and includes ChatGPT, Google AI Overviews, Perplexity, and Microsoft Copilot tracking.

### AthenaHQ

AI search visibility, competitive intelligence, hallucination detection.

AthenaHQ is positioned for cross-platform monitoring, competitive intelligence, hallucination detection, and prescriptive content work, but public pricing was not visible in the quick official-source pass.

### Scrunch

Positioned around agent experience and AI search readiness.

Scrunch publishes strong AI visibility/agent-experience positioning and FAQs around share of voice, citations, sentiment, AI referrals, and bot traffic, but public pricing was not visible in the quick official-source pass.

### Lumar

Enterprise website optimization, SEO, and AEO/GEO monitoring. Pricing is quote-based.

Current recommendation: do not buy an AI-visibility vendor yet. First fix the surfaces this repo already flags: canonical URLs, JSON-LD, Markdown mirrors, `llms.txt`, date freshness, and direct CTA links. If we want a cheap monitoring trial after that, start with Otterly Lite/Standard. Consider AthenaHQ/Scrunch/Lumar only when AI visibility becomes a growth KPI, not a QA prerequisite.

## LLM Evaluation

Potential internal tooling:

- LangSmith evals;
- DeepEval;
- Ragas;
- custom OpenAI/Anthropic judge prompts with source-grounding rubrics.

Use this for agent-readability scoring, not as the only release gate.

## Recommended Adoption Order

1. Playwright local checks and JSON report.
2. GitHub Actions scheduled run.
3. Checkly scheduled synthetic monitoring.
4. Percy or Argos visual review.
5. BrowserStack monthly/pre-launch sweep.
6. DebugBear or SpeedCurve performance history.
7. Sitebulb Cloud or Screaming Frog crawl audits.
8. Otterly/AthenaHQ AI visibility trial.
9. Custom dashboard backed by artifact metadata.

## Source Notes 2026-05-23

- Percy pricing: https://percy.io/pricing
- BrowserStack Percy plans: https://www.browserstack.com/docs/percy/overview/plans-and-billing
- Argos pricing: https://argos-ci.com/pricing
- Applitools Eyes: https://applitools.com/platform/eyes/
- BrowserStack mobile browser support: https://www.browserstack.com/support/faq/mobile/devices-amp-browsers/can-i-test-different-browsers-on-mobile-devices
- Sauce Labs supported browsers/devices: https://saucelabs.com/products/supported-browsers-devices
- Sauce Labs Playwright docs: https://docs.saucelabs.com/web-apps/automated-testing/playwright/
- Telegram Mini Apps docs: https://core.telegram.org/bots/webapps
- Arc release notes: https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes
- Otterly pricing: https://otterly.ai/pricing
- AthenaHQ: https://www.athenahq.ai/
- Scrunch FAQ: https://scrunch.com/faqs/
- Lumar pricing: https://www.lumar.io/pricing/
