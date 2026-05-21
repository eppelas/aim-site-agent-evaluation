# Browser and Device Matrix

Do not describe coverage only as engines. The system must track both engine coverage and branded browser coverage.

## Engine Layer

- Chromium;
- WebKit;
- Gecko / Firefox.

## P0 Browsers

Run regularly:

- Google Chrome desktop;
- Google Chrome Android;
- Safari macOS;
- Safari iOS;
- Firefox desktop;
- Microsoft Edge desktop.

## P1 Broad Sweep

Run monthly or before launch:

- Arc macOS;
- Yandex Browser desktop;
- Yandex Browser Android if available;
- Samsung Internet Android;
- Brave;
- Opera.

## P2 Analytics-Driven Browsers

Add based on real traffic:

- Telegram in-app browser iOS;
- Telegram in-app browser Android;
- Instagram/Facebook in-app browser if traffic appears;
- any browser with meaningful analytics share.

Telegram in-app browser may matter more than generic Opera/Brave because AI Mindset has important Telegram CTAs and likely Telegram-sourced traffic.

## Viewport Matrix

Core:

- `360x800`;
- `390x844`;
- `414x896`;
- `768x1024`;
- `820x1180`;
- `1366x768`;
- `1536x864`;
- `1920x1080`.

Monthly:

- `393x873`;
- `1280x800`;
- `1440x900`;
- `2560x1440`.

## Practical Notes

- Playwright can run branded Chrome and Edge with browser channels when installed.
- Safari should be tested as real Safari/WebKit on macOS/iOS when possible.
- Arc and Yandex may require local or manual real-browser sweeps if cloud support is unavailable.
- BrowserStack is the preferred real-device/browser cloud for monthly and pre-launch sweeps.
- Analytics should eventually shrink or reprioritize this matrix.

## Device Cloud Layer

DeviceCloud coverage is tracked separately from viewport emulation. The local runner can emulate sizes, but it cannot prove that a real iPhone, Android device, Windows Chrome, Windows Edge, or provider-specific browser behaves correctly.

The first DeviceCloud provider to wire should be BrowserStack, with LambdaTest/TestMu AI and Sauce Labs kept as fallback options. Do not treat Arc, Yandex Browser, or Telegram in-app browser as automatically solved by a generic cloud provider; keep them as explicit manual/local-runner or research lanes until verified.

Config:

- `config/device-cloud-matrix.json`

Detailed plan:

- `docs/13-device-cloud-integration.md`
