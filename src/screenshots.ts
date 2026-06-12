import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { DiscoveredRoute, ScreenshotArtifact, ScreenshotImageAnalysis, SiteConfig, ViewportConfig, VisualDiffResult } from "./types.js";
import { safeFilenameFromUrl } from "./url-utils.js";

const pixelmatchThreshold = 0.15;
const failureThresholdRatio = 0.01;
const failureThresholdPixels = 2500;
const blankRegionThresholdPx = 600;

export interface ScreenshotOptions {
  outputDir: string;
  viewports: ViewportConfig[];
  limit: number;
  baselineDir?: string;
  diffDir?: string;
}

export async function captureScreenshots(
  site: SiteConfig,
  routes: DiscoveredRoute[],
  options: ScreenshotOptions
): Promise<ScreenshotArtifact[]> {
  const selectedRoutes = options.limit > 0 ? routes.slice(0, options.limit) : routes;
  const artifacts: ScreenshotArtifact[] = [];

  await mkdir(options.outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of options.viewports) {
      const context = await newScreenshotContext(browser, viewport);

      for (const route of selectedRoutes) {
        const artifact = await captureScreenshotArtifact(context, site, route, viewport, options);
        if (artifact.status === "captured") {
          artifacts.push(artifact);
        } else {
          const retryContext = await newScreenshotContext(browser, viewport);
          const retryArtifact = await captureScreenshotArtifact(retryContext, site, route, viewport, options);
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

      await context.close();
    }
  } finally {
    await browser.close();
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
  options: ScreenshotOptions
): Promise<ScreenshotArtifact> {
  const siteDir = path.join(options.outputDir, site.id, viewport.name);
  await mkdir(siteDir, { recursive: true });
  const filePath = path.join(siteDir, `${safeFilenameFromUrl(route.url)}.png`);
  const baselinePath = options.baselineDir
    ? path.join(options.baselineDir, site.id, viewport.name, `${safeFilenameFromUrl(route.url)}.png`)
    : undefined;
  const diffPath = options.diffDir
    ? path.join(options.diffDir, site.id, viewport.name, `${safeFilenameFromUrl(route.url)}.diff.png`)
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
  const siteDir = path.join(options.outputDir, site.id, options.viewport.name);
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
