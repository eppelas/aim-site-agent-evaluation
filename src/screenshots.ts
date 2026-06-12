import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type {
  BrowserEngine,
  DiscoveredRoute,
  ElementRect,
  ScreenshotArtifact,
  ScreenshotImageAnalysis,
  ScreenshotState,
  SiteConfig,
  StickyOverlapIssue,
  ViewportConfig,
  VisualDiffResult,
  VisualStateConfig
} from "./types.js";
import { safeFilenameFromUrl } from "./url-utils.js";

const pixelmatchThreshold = 0.15;
const failureThresholdRatio = 0.01;
const failureThresholdPixels = 2500;
const blankRegionThresholdPx = 600;

export interface ScreenshotOptions {
  outputDir: string;
  viewports: ViewportConfig[];
  browserEngines?: BrowserEngine[];
  visualStates?: VisualStateConfig[];
  stateScreenshots?: boolean;
  fullPageScreenshots?: boolean;
  limit: number;
  baselineDir?: string;
  diffDir?: string;
}

const browserTypes: Record<BrowserEngine, BrowserType> = {
  chromium,
  firefox,
  webkit
};

export async function captureScreenshots(
  site: SiteConfig,
  routes: DiscoveredRoute[],
  options: ScreenshotOptions
): Promise<ScreenshotArtifact[]> {
  const selectedRoutes = options.limit > 0 ? routes.slice(0, options.limit) : routes;
  const artifacts: ScreenshotArtifact[] = [];
  const browserEngines: BrowserEngine[] = options.browserEngines?.length ? options.browserEngines : ["chromium"];

  await mkdir(options.outputDir, { recursive: true });

  for (const browserEngine of browserEngines) {
    const browser = await browserTypes[browserEngine].launch({ headless: true });

    try {
      for (const viewport of options.viewports) {
        const context = await newScreenshotContext(browser, viewport);

        if (options.fullPageScreenshots !== false) {
          for (const route of selectedRoutes) {
            const artifact = await captureScreenshotArtifact(context, site, route, viewport, browserEngine, options);
            if (artifact.status === "captured") {
              artifacts.push(artifact);
            } else {
              const retryContext = await newScreenshotContext(browser, viewport);
              const retryArtifact = await captureScreenshotArtifact(retryContext, site, route, viewport, browserEngine, options);
              await retryContext.close().catch(() => undefined);
              artifacts.push(
                retryArtifact.status === "captured"
                  ? retryArtifact
                  : {
                      ...retryArtifact,
                      error: `${artifact.error ?? "First capture failed."}\nRetry failed: ${retryArtifact.error ?? "Unknown retry error."}`
                    }
              );
            }
          }
        }

        await context.close();

        if (options.stateScreenshots && options.visualStates?.length) {
          const stateRoutes = selectedRoutes.filter((route) => new URL(route.url).pathname === "/");
          if (stateRoutes.length > 0) {
            const stateContext = await newScreenshotContext(browser, viewport);
            try {
              for (const route of stateRoutes) {
                artifacts.push(...(await captureStateScreenshotArtifacts(stateContext, site, route, viewport, browserEngine, options)));
              }
            } finally {
              await stateContext.close().catch(() => undefined);
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  }

  return artifacts;
}

async function newScreenshotContext(browser: Browser, viewport: ViewportConfig): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
}

async function captureScreenshotArtifact(
  context: BrowserContext,
  site: SiteConfig,
  route: DiscoveredRoute,
  viewport: ViewportConfig,
  browserEngine: BrowserEngine,
  options: ScreenshotOptions
): Promise<ScreenshotArtifact> {
  const siteDir = path.join(options.outputDir, site.id, browserEngine, viewport.name);
  await mkdir(siteDir, { recursive: true });
  const filePath = path.join(siteDir, `${safeFilenameFromUrl(route.url)}.png`);
  const baselinePath = options.baselineDir
    ? path.join(options.baselineDir, site.id, browserEngine, viewport.name, `${safeFilenameFromUrl(route.url)}.png`)
    : undefined;
  const diffPath = options.diffDir
    ? path.join(options.diffDir, site.id, browserEngine, viewport.name, `${safeFilenameFromUrl(route.url)}.diff.png`)
    : undefined;
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(20000);

  try {
    await gotoForScreenshot(page, route.url);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    await captureFullPageScreenshot(page, filePath);
    const metadata = await fileMetadata(filePath);
    const blankRegionRetry = metadata.image?.largestBlankRegion
      ? await recaptureAfterScrollSettle(page, filePath, viewport)
      : undefined;
    const comparison = baselinePath
      ? await compareOrCreateBaseline(filePath, baselinePath, metadata.sha256, diffPath)
      : { baselineStatus: "not-checked" as const };
    return {
      siteId: site.id,
      url: route.url,
      browserEngine,
      captureKind: "full-page",
      viewport,
      filePath,
      baselinePath,
      diffPath: comparison.diffPath,
      status: "captured",
      baselineStatus: comparison.baselineStatus,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      image: metadata.image,
      blankRegionRetry,
      visualDiff: comparison.visualDiff
    };
  } catch (error) {
    return {
      siteId: site.id,
      url: route.url,
      browserEngine,
      captureKind: "full-page",
      viewport,
      filePath,
      baselinePath,
      diffPath,
      status: "failed",
      baselineStatus: "missing",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function captureStateScreenshotArtifacts(
  context: BrowserContext,
  site: SiteConfig,
  route: DiscoveredRoute,
  viewport: ViewportConfig,
  browserEngine: BrowserEngine,
  options: ScreenshotOptions
): Promise<ScreenshotArtifact[]> {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(20000);

  try {
    await gotoForScreenshot(page, route.url);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1000);

    const artifacts: ScreenshotArtifact[] = [];
    for (const visualState of options.visualStates ?? []) {
      artifacts.push(await captureStateScreenshotArtifact(page, site, route, viewport, browserEngine, visualState, options));
    }

    return artifacts;
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function captureStateScreenshotArtifact(
  page: Page,
  site: SiteConfig,
  route: DiscoveredRoute,
  viewport: ViewportConfig,
  browserEngine: BrowserEngine,
  visualState: VisualStateConfig,
  options: ScreenshotOptions
): Promise<ScreenshotArtifact> {
  const siteDir = path.join(options.outputDir, site.id, browserEngine, viewport.name);
  await mkdir(siteDir, { recursive: true });
  const stateName = safeStateName(visualState.name);
  const filePath = path.join(siteDir, `${safeFilenameFromUrl(route.url)}.${stateName}.viewport.png`);
  const baselinePath = options.baselineDir
    ? path.join(options.baselineDir, site.id, browserEngine, viewport.name, `${safeFilenameFromUrl(route.url)}.${stateName}.viewport.png`)
    : undefined;
  const diffPath = options.diffDir
    ? path.join(options.diffDir, site.id, browserEngine, viewport.name, `${safeFilenameFromUrl(route.url)}.${stateName}.viewport.diff.png`)
    : undefined;
  const fallbackState: ScreenshotState = {
    name: visualState.name,
    selector: visualState.selector,
    scrollY: visualState.scrollY ?? 0,
    description: visualState.description
  };

  try {
    const state = await scrollToVisualState(page, visualState, viewport);
    const stickyOverlaps = await detectStickyOverlaps(page, state);
    await page.screenshot({ path: filePath, fullPage: false, animations: "disabled", timeout: 20000 });
    const metadata = await fileMetadata(filePath);
    const comparison = baselinePath
      ? await compareOrCreateBaseline(filePath, baselinePath, metadata.sha256, diffPath)
      : { baselineStatus: "not-checked" as const };

    return {
      siteId: site.id,
      url: route.url,
      browserEngine,
      captureKind: "viewport-state",
      state,
      viewport,
      filePath,
      baselinePath,
      diffPath: comparison.diffPath,
      status: "captured",
      baselineStatus: comparison.baselineStatus,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      image: metadata.image,
      stickyOverlaps,
      visualDiff: comparison.visualDiff
    };
  } catch (error) {
    return {
      siteId: site.id,
      url: route.url,
      browserEngine,
      captureKind: "viewport-state",
      state: fallbackState,
      viewport,
      filePath,
      baselinePath,
      diffPath,
      status: "failed",
      baselineStatus: "missing",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function scrollToVisualState(page: Page, visualState: VisualStateConfig, viewport: ViewportConfig): Promise<ScreenshotState> {
  const scrollY = await page.evaluate(
    ({ selector, configuredScrollY, viewportHeight }) => {
      if (typeof configuredScrollY === "number") {
        return Math.max(0, Math.round(configuredScrollY));
      }

      if (!selector) return 0;
      const element = document.querySelector(selector);
      if (!element) return 0;
      const rect = element.getBoundingClientRect();
      const offset = Math.max(16, Math.round(viewportHeight * 0.08));
      return Math.max(0, Math.round(window.scrollY + rect.top - offset));
    },
    { selector: visualState.selector, configuredScrollY: visualState.scrollY, viewportHeight: viewport.height }
  );

  await page.evaluate((targetY) => window.scrollTo({ top: targetY, left: 0, behavior: "instant" }), scrollY);
  await page.waitForTimeout(900);

  return {
    name: visualState.name,
    selector: visualState.selector,
    scrollY,
    description: visualState.description
  };
}

async function detectStickyOverlaps(page: Page, state: ScreenshotState): Promise<StickyOverlapIssue[]> {
  await page.evaluate(() => {
    const globalWithName = globalThis as typeof globalThis & { __name?: <T>(target: T) => T };
    globalWithName.__name ??= (target) => target;
  });

  return page.evaluate((stateConfig) => {
    type Rect = ElementRect;
    type Issue = StickyOverlapIssue;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportArea = viewportWidth * viewportHeight;

    const toRect = (rect: DOMRect): Rect => ({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left)
    });
    const visible = (rect: DOMRect): boolean =>
      rect.width >= 8 &&
      rect.height >= 8 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < viewportHeight &&
      rect.left < viewportWidth;
    const clipToViewport = (rect: DOMRect): Rect => {
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(viewportWidth, rect.right);
      const bottom = Math.min(viewportHeight, rect.bottom);
      return {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.max(0, Math.round(right - left)),
        height: Math.max(0, Math.round(bottom - top)),
        top: Math.round(top),
        right: Math.round(right),
        bottom: Math.round(bottom),
        left: Math.round(left)
      };
    };
    const intersection = (a: Rect, b: Rect): Rect | undefined => {
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      if (right <= left || bottom <= top) return undefined;
      return {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(right - left),
        height: Math.round(bottom - top),
        top: Math.round(top),
        right: Math.round(right),
        bottom: Math.round(bottom),
        left: Math.round(left)
      };
    };
    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const attr = element.getAttribute("aria-label") || element.getAttribute("data-section") || element.getAttribute("href");
      const tag = element.tagName.toLowerCase();
      if (attr) return `${tag}[${attr.slice(0, 36)}]`;
      const parent = element.parentElement;
      if (!parent) return tag;
      const index = Array.from(parent.children).indexOf(element) + 1;
      return `${selectorFor(parent)} > ${tag}:nth-child(${index})`;
    };
    const ownText = (element: Element): string => (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const hasPositionedAncestor = (element: Element): boolean => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const position = window.getComputedStyle(parent).position;
        if (position === "fixed" || position === "sticky") return true;
      }
      return false;
    };
    const hasVisibleText = (element: Element): boolean => ownText(element).length >= 2;
    const isContainerCandidate = (element: Element, style: CSSStyleDeclaration): boolean => {
      const tag = element.tagName.toLowerCase();
      const hasFrame =
        style.borderTopWidth !== "0px" ||
        style.borderRightWidth !== "0px" ||
        style.borderBottomWidth !== "0px" ||
        style.borderLeftWidth !== "0px" ||
        style.boxShadow !== "none" ||
        (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent");
      return ["article", "section", "main", "aside", "div", "li"].includes(tag) && hasFrame && hasVisibleText(element);
    };

    const fixedElements = Array.from(document.querySelectorAll("body *"))
      .map((element) => ({ element, style: window.getComputedStyle(element), rect: element.getBoundingClientRect() }))
      .filter(({ element, style, rect }) => {
        const position = style.position;
        const area = rect.width * rect.height;
        if (position !== "fixed" && position !== "sticky") return false;
        if (!visible(rect)) return false;
        if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity || "1") < 0.05) return false;
        if (area > viewportArea * 0.75 && !hasVisibleText(element)) return false;
        const tag = element.tagName.toLowerCase();
        const label = `${element.getAttribute("aria-label") ?? ""} ${ownText(element)}`.toLowerCase();
        const looksLikeSectionNav =
          tag === "nav" &&
          (label.includes("раздел") ||
            (label.includes("зачем") && label.includes("спикер") && label.includes("маршрут")) ||
            (label.includes("тариф") && label.includes("отзыв") && label.includes("faq")));
        const sitsOnSide =
          rect.height >= viewportHeight * 0.22 &&
          rect.width <= viewportWidth * 0.42 &&
          (rect.left >= viewportWidth * 0.42 || rect.right <= viewportWidth * 0.58);
        return looksLikeSectionNav && sitsOnSide;
      });

    const contentRoot = stateConfig.selector ? document.querySelector(stateConfig.selector) : document.querySelector("main");
    const contentScope = contentRoot ?? document.body;
    const contentElements = [contentScope, ...Array.from(contentScope.querySelectorAll("article, div, h1, h2, h3, p, li, a, button, [role='button']"))]
      .map((element) => ({ element, style: window.getComputedStyle(element), rect: element.getBoundingClientRect() }))
      .filter(({ element, style, rect }) => {
        const area = rect.width * rect.height;
        if (!visible(rect)) return false;
        if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity || "1") < 0.05) return false;
        if (hasPositionedAncestor(element)) return false;
        if (area > viewportArea * 0.68) return false;
        if (["script", "style", "svg", "canvas"].includes(element.tagName.toLowerCase())) return false;
        return hasVisibleText(element) || isContainerCandidate(element, style);
      });

    const issues: Issue[] = [];
    const seen = new Set<string>();

    for (const fixed of fixedElements) {
      const fixedRect = clipToViewport(fixed.rect);
      for (const content of contentElements) {
        if (fixed.element === content.element || fixed.element.contains(content.element) || content.element.contains(fixed.element)) continue;
        const contentRect = clipToViewport(content.rect);
        const overlap = intersection(fixedRect, contentRect);
        const keyBase = `${selectorFor(fixed.element)}::${selectorFor(content.element)}`;

        if (overlap) {
          const overlapArea = overlap.width * overlap.height;
          const smallerArea = Math.max(1, Math.min(fixedRect.width * fixedRect.height, contentRect.width * contentRect.height));
          if (overlapArea >= 120 && overlapArea / smallerArea >= 0.015) {
            const key = `overlap::${keyBase}`;
            if (!seen.has(key)) {
              seen.add(key);
              issues.push({
                kind: "overlap",
                stateName: stateConfig.name,
                scrollY: Math.round(window.scrollY),
                fixedSelector: selectorFor(fixed.element),
                fixedPosition: fixed.style.position as "fixed" | "sticky",
                fixedText: ownText(fixed.element),
                fixedRect,
                contentSelector: selectorFor(content.element),
                contentText: ownText(content.element),
                contentRect,
                intersection: overlap,
                intersectionArea: overlapArea
              });
            }
          }
        } else {
          const horizontalGap = Math.max(contentRect.left - fixedRect.right, fixedRect.left - contentRect.right, 0);
          const verticalOverlap = Math.max(0, Math.min(fixedRect.bottom, contentRect.bottom) - Math.max(fixedRect.top, contentRect.top));
          const meaningfulVerticalOverlap = verticalOverlap >= Math.min(72, Math.max(20, Math.min(fixedRect.height, contentRect.height) * 0.35));
          const fixedIsSidebar = fixedRect.height >= viewportHeight * 0.22 || fixedRect.width >= 120;
          if (fixedIsSidebar && meaningfulVerticalOverlap && horizontalGap <= 24) {
            const key = `near::${keyBase}`;
            if (!seen.has(key)) {
              seen.add(key);
              issues.push({
                kind: "near-overlap",
                stateName: stateConfig.name,
                scrollY: Math.round(window.scrollY),
                fixedSelector: selectorFor(fixed.element),
                fixedPosition: fixed.style.position as "fixed" | "sticky",
                fixedText: ownText(fixed.element),
                fixedRect,
                contentSelector: selectorFor(content.element),
                contentText: ownText(content.element),
                contentRect,
                horizontalGap,
                verticalOverlap
              });
            }
          }
        }

        if (issues.length >= 12) return issues;
      }
    }

    return issues;
  }, { name: state.name, selector: state.selector });
}

function safeStateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "state";
}

export async function captureFocusedScreenshot(
  site: SiteConfig,
  url: string,
  options: {
    outputDir: string;
    viewport: ViewportConfig;
    fileSuffix: string;
    scrollY: number;
  }
): Promise<ScreenshotArtifact> {
  const siteDir = path.join(options.outputDir, site.id, "chromium", options.viewport.name);
  await mkdir(siteDir, { recursive: true });
  const filePath = path.join(siteDir, `${safeFilenameFromUrl(url)}.${options.fileSuffix}.png`);
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: options.viewport.width, height: options.viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(20000);

    try {
      await page.goto(url, { waitUntil: "commit", timeout: 30000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, left: 0, behavior: "instant" }), options.scrollY);
      await page.waitForTimeout(1200);
      const client = await page.context().newCDPSession(page);
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false
      });
      await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
      const metadata = await fileMetadata(filePath);
      return {
        siteId: site.id,
        url,
        browserEngine: "chromium",
        captureKind: "focused",
        state: {
          name: options.fileSuffix,
          scrollY: options.scrollY
        },
        viewport: options.viewport,
        filePath,
        status: "captured",
        baselineStatus: "not-checked",
        byteSize: metadata.byteSize,
        sha256: metadata.sha256,
        image: metadata.image
      };
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  } catch (error) {
    return {
      siteId: site.id,
      url,
      browserEngine: "chromium",
      captureKind: "focused",
      state: {
        name: options.fileSuffix,
        scrollY: options.scrollY
      },
      viewport: options.viewport,
      filePath,
      status: "failed",
      baselineStatus: "not-checked",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await browser.close();
  }
}

async function gotoForScreenshot(page: Page, url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 45000 });
      return;
    } catch (error) {
      lastError = error;
      await page.goto("about:blank", { waitUntil: "commit", timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(1500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function compareOrCreateBaseline(
  filePath: string,
  baselinePath: string,
  currentSha256: string,
  diffPath: string | undefined
): Promise<{
  baselineStatus: NonNullable<ScreenshotArtifact["baselineStatus"]>;
  visualDiff?: VisualDiffResult;
  diffPath?: string;
}> {
  try {
    const baseline = await readFile(baselinePath);
    const baselineSha256 = createHash("sha256").update(baseline).digest("hex");
    if (baselineSha256 === currentSha256) return { baselineStatus: "matched", visualDiff: zeroDiff(baseline) };

    const visualDiff = await comparePngFiles(filePath, baselinePath, diffPath);
    const changed =
      visualDiff.mismatchRatio > failureThresholdRatio &&
      visualDiff.mismatchPixels > failureThresholdPixels;

    return { baselineStatus: changed ? "changed" : "matched", visualDiff, diffPath: changed ? diffPath : undefined };
  } catch {
    await mkdir(path.dirname(baselinePath), { recursive: true });
    await copyFile(filePath, baselinePath);
    return { baselineStatus: "baseline-created" };
  }
}

async function fileMetadata(filePath: string): Promise<{ byteSize: number; sha256: string; image?: ScreenshotImageAnalysis }> {
  const [stats, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
  return {
    byteSize: stats.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    image: analyzePng(bytes)
  };
}

async function recaptureAfterScrollSettle(
  page: Page,
  originalFilePath: string,
  viewport: ViewportConfig
): Promise<NonNullable<ScreenshotArtifact["blankRegionRetry"]>> {
  const parsed = path.parse(originalFilePath);
  const retryPath = path.join(parsed.dir, `${parsed.name}.scroll-settle${parsed.ext}`);
  try {
    await settlePageForScreenshot(page, viewport);
    await captureFullPageScreenshot(page, retryPath);
    const metadata = await fileMetadata(retryPath);
    return {
      strategy: "scroll-settle-recapture",
      status: metadata.image?.largestBlankRegion ? "still-blank-after-scroll" : "resolved-after-scroll",
      filePath: retryPath,
      image: metadata.image
    };
  } catch (error) {
    return {
      strategy: "scroll-settle-recapture",
      status: "failed",
      filePath: retryPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function analyzePng(bytes: Buffer): ScreenshotImageAnalysis | undefined {
  try {
    const png = PNG.sync.read(bytes);
    const totalPixels = png.width * png.height;
    if (totalPixels === 0) {
      return {
        width: png.width,
        height: png.height,
        totalPixels,
        sampledPixels: 0,
        nonWhiteRatio: 0,
        nonTransparentRatio: 0,
        dominantColorRatio: 0,
        uniqueColorCount: 0,
        isProbablyBlank: true,
        blankRegions: [],
        blankRegionThresholdPx
      };
    }

    const blankRegions = findBlankRegions(png, blankRegionThresholdPx);
    const largestBlankRegion = blankRegions.sort((a, b) => b.height - a.height)[0];
    const maxSamples = 120000;
    const stride = Math.max(1, Math.floor(totalPixels / maxSamples));
    const colorCounts = new Map<string, number>();
    let sampledPixels = 0;
    let nonWhitePixels = 0;
    let nonTransparentPixels = 0;

    for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += stride) {
      const offset = pixelIndex << 2;
      const red = png.data[offset];
      const green = png.data[offset + 1];
      const blue = png.data[offset + 2];
      const alpha = png.data[offset + 3];
      const colorKey = `${red},${green},${blue},${alpha}`;
      colorCounts.set(colorKey, (colorCounts.get(colorKey) ?? 0) + 1);
      sampledPixels += 1;

      if (alpha > 8) nonTransparentPixels += 1;
      if (alpha > 8 && (red < 246 || green < 246 || blue < 246)) nonWhitePixels += 1;
    }

    const dominantColorCount = Math.max(0, ...colorCounts.values());
    const nonWhiteRatio = sampledPixels === 0 ? 0 : nonWhitePixels / sampledPixels;
    const nonTransparentRatio = sampledPixels === 0 ? 0 : nonTransparentPixels / sampledPixels;
    const dominantColorRatio = sampledPixels === 0 ? 0 : dominantColorCount / sampledPixels;
    const isProbablyBlank =
      sampledPixels === 0 ||
      nonTransparentRatio < 0.01 ||
      (dominantColorRatio > 0.995 && nonWhiteRatio < 0.002 && colorCounts.size <= 8);

    return {
      width: png.width,
      height: png.height,
      totalPixels,
      sampledPixels,
      nonWhiteRatio,
      nonTransparentRatio,
      dominantColorRatio,
      uniqueColorCount: colorCounts.size,
      isProbablyBlank,
      largestBlankRegion,
      blankRegions,
      blankRegionThresholdPx
    };
  } catch {
    return undefined;
  }
}

async function captureFullPageScreenshot(page: Page, filePath: string): Promise<void> {
  try {
    await page.screenshot({ path: filePath, fullPage: true, animations: "disabled", timeout: 20000 });
  } catch (primaryError) {
    try {
      await captureFullPageScreenshotViaCdp(page, filePath);
    } catch (fallbackError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`${primaryMessage}\nCDP screenshot fallback failed: ${fallbackMessage}`);
    }
  }
}

async function captureFullPageScreenshotViaCdp(page: Page, filePath: string): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important;}`
  }).catch(() => undefined);
  const client = await page.context().newCDPSession(page);
  const metrics = await client.send("Page.getLayoutMetrics");
  const viewport = page.viewportSize();
  const width = Math.ceil(Math.max(metrics.contentSize.width, viewport?.width ?? 0, 1));
  const height = Math.ceil(Math.max(metrics.contentSize.height, viewport?.height ?? 0, 1));
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 }
  });
  await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
}

async function settlePageForScreenshot(page: Page, viewport: ViewportConfig): Promise<void> {
  await page.waitForTimeout(300);
  const scrollHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const step = Math.max(300, Math.floor(viewport.height * 0.75));

  for (let y = 0; y < scrollHeight; y += step) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(120);
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

function findBlankRegions(png: PNG, minHeight: number): NonNullable<ScreenshotImageAnalysis["blankRegions"]> {
  const regions: NonNullable<ScreenshotImageAnalysis["blankRegions"]> = [];
  let active:
    | {
        startY: number;
        endY: number;
        dominantColorRatioTotal: number;
        uniqueColorCountTotal: number;
        rows: number;
      }
    | undefined;

  for (let y = 0; y < png.height; y += 1) {
    const row = analyzeRow(png, y);
    const isBlankRow = row.dominantColorRatio >= 0.985 && row.uniqueColorCount <= 6;

    if (isBlankRow) {
      if (!active) {
        active = {
          startY: y,
          endY: y,
          dominantColorRatioTotal: 0,
          uniqueColorCountTotal: 0,
          rows: 0
        };
      }
      active.endY = y;
      active.dominantColorRatioTotal += row.dominantColorRatio;
      active.uniqueColorCountTotal += row.uniqueColorCount;
      active.rows += 1;
    } else if (active) {
      pushBlankRegion(regions, active, minHeight);
      active = undefined;
    }
  }

  if (active) pushBlankRegion(regions, active, minHeight);
  return regions;
}

function pushBlankRegion(
  regions: NonNullable<ScreenshotImageAnalysis["blankRegions"]>,
  region: { startY: number; endY: number; dominantColorRatioTotal: number; uniqueColorCountTotal: number; rows: number },
  minHeight: number
): void {
  const height = region.endY - region.startY + 1;
  if (height < minHeight || region.rows === 0) return;
  regions.push({
    startY: region.startY,
    endY: region.endY,
    height,
    averageDominantColorRatio: region.dominantColorRatioTotal / region.rows,
    averageUniqueColorCount: region.uniqueColorCountTotal / region.rows
  });
}

function analyzeRow(png: PNG, y: number): { dominantColorRatio: number; uniqueColorCount: number } {
  const colorCounts = new Map<string, number>();
  const stride = Math.max(1, Math.floor(png.width / 240));
  let samples = 0;

  for (let x = 0; x < png.width; x += stride) {
    const offset = (png.width * y + x) << 2;
    const red = Math.round(png.data[offset] / 8) * 8;
    const green = Math.round(png.data[offset + 1] / 8) * 8;
    const blue = Math.round(png.data[offset + 2] / 8) * 8;
    const alpha = Math.round(png.data[offset + 3] / 8) * 8;
    const key = `${red},${green},${blue},${alpha}`;
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
    samples += 1;
  }

  const dominantColorCount = Math.max(0, ...colorCounts.values());
  return {
    dominantColorRatio: samples === 0 ? 0 : dominantColorCount / samples,
    uniqueColorCount: colorCounts.size
  };
}

async function comparePngFiles(filePath: string, baselinePath: string, diffPath: string | undefined): Promise<VisualDiffResult> {
  const [currentBytes, baselineBytes] = await Promise.all([readFile(filePath), readFile(baselinePath)]);
  const current = PNG.sync.read(currentBytes);
  const baseline = PNG.sync.read(baselineBytes);
  const width = Math.max(current.width, baseline.width);
  const height = Math.max(current.height, baseline.height);
  const currentCanvas = normalizePng(current, width, height);
  const baselineCanvas = normalizePng(baseline, width, height);
  const diff = new PNG({ width, height });
  const mismatchPixels = pixelmatch(
    baselineCanvas.data,
    currentCanvas.data,
    diff.data,
    width,
    height,
    { threshold: pixelmatchThreshold, includeAA: false }
  );
  const mismatchRatio = width * height === 0 ? 0 : mismatchPixels / (width * height);

  const result = {
    mismatchPixels,
    mismatchRatio,
    width,
    height,
    currentWidth: current.width,
    currentHeight: current.height,
    baselineWidth: baseline.width,
    baselineHeight: baseline.height,
    pixelmatchThreshold,
    failureThresholdRatio,
    failureThresholdPixels
  };

  const changed =
    result.mismatchRatio > result.failureThresholdRatio &&
    result.mismatchPixels > result.failureThresholdPixels;

  if (diffPath && changed) {
    await mkdir(path.dirname(diffPath), { recursive: true });
    await writeFile(diffPath, PNG.sync.write(diff));
  }

  return result;
}

function normalizePng(source: PNG, width: number, height: number): PNG {
  const canvas = new PNG({ width, height });
  for (let offset = 0; offset < canvas.data.length; offset += 4) {
    canvas.data[offset] = 255;
    canvas.data[offset + 1] = 255;
    canvas.data[offset + 2] = 255;
    canvas.data[offset + 3] = 255;
  }

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (source.width * y + x) << 2;
      const targetOffset = (width * y + x) << 2;
      canvas.data[targetOffset] = source.data[sourceOffset];
      canvas.data[targetOffset + 1] = source.data[sourceOffset + 1];
      canvas.data[targetOffset + 2] = source.data[sourceOffset + 2];
      canvas.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }

  return canvas;
}

function zeroDiff(bytes: Buffer): VisualDiffResult | undefined {
  try {
    const png = PNG.sync.read(bytes);
    return {
      mismatchPixels: 0,
      mismatchRatio: 0,
      width: png.width,
      height: png.height,
      currentWidth: png.width,
      currentHeight: png.height,
      baselineWidth: png.width,
      baselineHeight: png.height,
      pixelmatchThreshold,
      failureThresholdRatio,
      failureThresholdPixels
    };
  } catch {
    return undefined;
  }
}
