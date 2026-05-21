# Device Cloud Integration Plan

This document tracks how to add real browser and real device coverage to the GitHub Actions system.

## Current Decision

Use a layered model:

1. Local Playwright in GitHub Actions remains the fast baseline.
2. A separate DeviceCloud job runs real desktop browsers and real mobile devices.
3. Visual/performance artifacts from DeviceCloud are folded back into the same dashboard model.
4. Arc, Yandex Browser, and Telegram in-app browsers remain separate coverage lanes until a provider or local runner can automate them reliably.

## Preferred Provider

BrowserStack is the current preferred first provider because its official Playwright documentation covers:

- GitHub Actions integration with repository secrets;
- real desktop and mobile browser execution;
- BrowserStack Local tunnel support;
- Playwright capabilities for branded Chrome/Edge and bundled Playwright browsers;
- real iOS Safari Playwright support.

Fallback providers to compare before purchase or long-term commitment:

- LambdaTest / TestMu AI;
- Sauce Labs.

## Required GitHub Secrets

For BrowserStack:

- `BROWSERSTACK_USERNAME`
- `BROWSERSTACK_ACCESS_KEY`

Optional later:

- `BROWSERSTACK_PROJECT_NAME`
- `BROWSERSTACK_BUILD_NAME`

## GitHub Actions Shape

DeviceCloud should be a separate workflow job, not part of the fast CI gate at first.

Reasons:

- cloud runs are slower and billable;
- false positives need tuning;
- real-device availability can fluctuate;
- the normal QA report should still run when the vendor is unavailable.

Recommended modes:

| Mode | Trigger | Scope |
| --- | --- | --- |
| `device-cloud-smoke` | manual | P0 routes, P0 browsers/devices |
| `device-cloud-monthly` | scheduled monthly | broader browser/device matrix |
| `device-cloud-launch` | manual before launch | full mapped production/staging routes |

## P0 Device Cloud Matrix

| Coverage | Reason |
| --- | --- |
| Chrome on Windows | Main non-Mac desktop reality check. |
| Edge on Windows | Enterprise/default Windows browser check. |
| Firefox on Windows or macOS | Gecko layout and compatibility check. |
| Safari/WebKit-class desktop rendering | Safari-style rendering risk. |
| Real iOS Safari | Highest-value mobile Safari check; local emulation is not enough. |
| Real Android Chrome | Highest-value Android browser check. |

## P1/P2 Coverage

| Coverage | Status |
| --- | --- |
| Arc macOS | Likely local/manual or analytics-driven. Do not assume DeviceCloud automation. |
| Yandex Browser | Likely local/manual or provider-specific. Do not assume Playwright cloud support. |
| Samsung Internet Android | Check provider availability. |
| Telegram in-app browser iOS/Android | Needs separate research: likely Appium/manual real-device flow rather than standard Playwright. |

## Implementation Tasks

| Status | Task |
| --- | --- |
| done | Add desired DeviceCloud matrix config. |
| done | Add DeviceCloud integration document. |
| next | Add a `device-cloud` workflow mode that skips cleanly until secrets exist. |
| next | Add BrowserStack connection adapter for Playwright screenshots/health checks. |
| next | Store provider session URLs, videos, logs, and device metadata in `report.json`. |
| next | Add dashboard section for DeviceCloud coverage and session links. |
| blocked | Run real DeviceCloud checks. Needs provider account and GitHub secrets. |

## Source Notes

- BrowserStack Playwright GitHub Actions docs: https://www.browserstack.com/docs/automate/playwright/github-actions
- BrowserStack Playwright overview: https://www.browserstack.com/docs/automate/playwright
- BrowserStack Playwright capabilities: https://www.browserstack.com/docs/automate/playwright/playwright-capabilities
- BrowserStack Playwright local testing: https://www.browserstack.com/docs/automate/playwright/local-testing/introduction
- BrowserStack Playwright real iOS docs: https://www.browserstack.com/docs/automate/playwright/playwright-ios/c-sharp
- Playwright browser support docs: https://playwright.dev/docs/browsers
- LambdaTest Playwright CI/CD docs: https://www.lambdatest.com/support/docs/playwright-tests-in-ci-cd/
- Sauce Labs Playwright docs: https://docs.saucelabs.com/web-apps/automated-testing/playwright/
