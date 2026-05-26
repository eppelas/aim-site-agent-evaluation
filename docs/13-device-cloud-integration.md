# Device Cloud Integration Plan

This document tracks how to add real browser and real device coverage to the GitHub Actions system.

## Current Decision

Use a layered model:

1. Local Playwright in GitHub Actions remains the fast baseline.
2. A separate DeviceCloud job runs real desktop browsers and real mobile devices.
3. Visual/performance artifacts from DeviceCloud are folded back into the same dashboard model.
4. Arc, Yandex Browser, and Telegram in-app browsers remain separate coverage lanes until a provider or local runner can automate them reliably.

## Preferred Provider

BrowserStack is the strongest first automation provider, but not the cheapest manual option.

Why BrowserStack is still the preferred automation target:

- GitHub Actions integration with repository secrets;
- real desktop and mobile browser execution;
- BrowserStack Local tunnel support;
- Playwright capabilities for branded Chrome/Edge and bundled Playwright browsers;
- real iOS Safari Playwright support.

Fallback providers:

- LambdaTest / TestMu AI: best low-cost/manual first experiment.
- Sauce Labs: mature enterprise option, usually more expensive for this use case.

## Pricing Snapshot

Verified from public vendor pages on 2026-05-22. Treat these as planning numbers; vendor plans change often and final prices should be checked before purchase.

| Provider | Low-cost manual plan | Automated/browser-device plan | What They Require | Notes |
| --- | --- | --- | --- | --- |
| BrowserStack | Live Desktop & Mobile: `$39/month` billed annually for one user. | Automate Desktop & Mobile: `$175/month` billed annually for 1 parallel test. Desktop & Mobile Pro: `$225/month` billed annually. | Account, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, optional Local tunnel for private/local URLs. | Strongest docs and Playwright/GitHub fit. Good session artifacts, real devices, staging/local support. Higher automation entry price. |
| TestMu AI / LambdaTest | Free plan; Virtual Live: `$15/month`; ChromeOS Live: `$29/month`; Real Device Plus Live: `$39/month`, billed annually. | Public pricing page exposes live/manual prices clearly; automation cloud is documented but may need account/sales confirmation for exact Playwright automation pricing. | Account, `LT_USERNAME`, `LT_ACCESS_KEY`; Local Testing tunnel for private/local URLs. | Cheapest first manual/real-device experiment. Pricing page says 1 parallel test on free and pricing is based on parallel sessions. Good candidate before committing to BrowserStack. |
| Sauce Labs | Not the cheapest for manual-only QA. | Virtual Device Cloud: `$149/month` billed annually; Real Device Cloud: `$199/month` billed annually for 1 parallel test. | Account, `SAUCE_USERNAME`, `SAUCE_ACCESS_KEY`; Sauce Connect for private/local URLs. | Mature and CI-friendly. Includes logs/screenshots/videos and visual testing snapshot allowance, but cost is higher for the first version. |
| Local Playwright / GitHub Actions | Free except GitHub minutes. | Free except GitHub minutes. | No vendor account. Installs Playwright browsers in CI. | Best default baseline. Covers Chromium, Firefox, WebKit, Google Chrome, and Microsoft Edge channels when available, but not true real iOS Safari/Android device behavior. |

## Recommendation

Start with this order:

1. Keep local Playwright + GitHub Actions as the default recurring automation.
2. Add a skip-clean DeviceCloud workflow shape now, so the repo is ready but does not fail without secrets.
3. Trial TestMu AI/LambdaTest manually first because the live real-device entry price is lower.
4. Use BrowserStack for the first real automated DeviceCloud integration if budget allows.
5. Keep Sauce Labs as an enterprise fallback if BrowserStack/TestMu AI do not cover the exact devices or workflow artifacts we need.

Do not try to solve Arc, Yandex Browser, and Telegram in-app browser through standard Playwright cloud automation at V1:

- Arc is Chromium-based, but cloud support is not a normal Playwright target. Treat it as local/manual until analytics prove it matters.
- Yandex Browser is Chromium-based and may be available in some manual clouds, but should not be assumed automatable in CI.
- Telegram in-app browser is a WebView context. Treat it as a separate Appium/manual real-device workflow, not ordinary browser automation.

## Research Refresh 2026-05-23

Official-source check:

- BrowserStack remains the best first automated target for this repo because it has Playwright docs, GitHub Actions docs, Local tunnel support, and explicit mobile browser coverage. BrowserStack support docs list Android mobile browser coverage as Chrome, Edge, Firefox, Samsung Browser on Samsung devices, and UC Browser on select devices; iOS coverage is Safari and Chrome.
- Sauce Labs has broad official coverage across desktop browsers, emulators/simulators, and real iOS/Android devices. Its supported-browser page currently lists Chrome, Firefox, Safari, Edge, iOS, and Android coverage, plus Playwright docs for Chromium, Chrome, Firefox, and WebKit.
- LambdaTest/TestMu remains useful as a low-cost manual/live experiment and may expose Yandex in manual remote-browser marketing pages, but we should not base CI automation on Yandex support until verified inside an account.
- Arc desktop should be treated as local/manual. Official Arc pages now state Arc receives Chromium updates, and Arc release notes are Chromium-version based; cloud providers do not expose Arc as a normal automation target.
- Telegram in-app browser should be treated as WebView/Appium/manual. Telegram Mini Apps docs show platform-specific WebView user agents and Android debug WebView support; this is not ordinary desktop browser automation.

Practical decision:

1. Implement BrowserStack adapter first when paid automation budget exists.
2. Keep local Playwright Chromium/Firefox/WebKit as the recurring baseline.
3. Use LambdaTest/TestMu manually for quick Yandex or low-cost exploratory checks if account access is available.
4. Use Sauce Labs only if BrowserStack cannot cover a launch-critical device/session artifact.
5. Track Arc and Telegram separately as manual/Appium lanes, not as CI blockers.

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
| done | Add a `device-cloud` workflow mode that skips cleanly until secrets exist. |
| next | Add BrowserStack connection adapter for Playwright screenshots/health checks. |
| next | Store provider session URLs, videos, logs, and device metadata in `report.json`. |
| next | Add dashboard section for DeviceCloud coverage and session links. |
| blocked | Run real DeviceCloud checks. Needs provider account and GitHub secrets. |

## Source Notes

- BrowserStack pricing: https://www.browserstack.com/pricing/
- BrowserStack Playwright GitHub Actions docs: https://www.browserstack.com/docs/automate/playwright/github-actions
- BrowserStack Playwright overview: https://www.browserstack.com/docs/automate/playwright/overview
- BrowserStack Playwright capabilities: https://www.browserstack.com/docs/automate/playwright/playwright-capabilities
- BrowserStack Playwright local testing: https://www.browserstack.com/docs/automate/playwright/local-testing/introduction
- BrowserStack Playwright real iOS docs: https://www.browserstack.com/docs/automate/playwright/playwright-ios/c-sharp
- Playwright browser support docs: https://playwright.dev/docs/browsers
- TestMu AI / LambdaTest pricing: https://www.testmuai.com/pricing/
- LambdaTest Playwright docs: https://www.lambdatest.com/support/docs/playwright-testing/
- LambdaTest Playwright CI/CD docs: https://www.lambdatest.com/support/docs/playwright-tests-in-ci-cd/
- Sauce Labs pricing: https://saucelabs.com/pricing
- Sauce Labs Playwright docs: https://docs.saucelabs.com/web-apps/automated-testing/playwright/
