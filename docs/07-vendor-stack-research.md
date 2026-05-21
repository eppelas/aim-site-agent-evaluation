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

### Argos

Lean visual testing with GitHub-friendly workflow.

### Applitools

Strongest visual AI option for lower false positives and enterprise-grade cross-browser visual testing. Higher cost.

### Chromatic

Best when a Storybook/component system exists.

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

### AthenaHQ

AI search visibility, competitive intelligence, hallucination detection.

### Scrunch

Positioned around agent experience and AI search readiness.

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
