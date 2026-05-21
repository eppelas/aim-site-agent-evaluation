import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { DiscoveredRoute, ScreenshotArtifact, SiteConfig, ViewportConfig, VisualDiffResult } from "./types.js";
import { safeFilenameFromUrl } from "./url-utils.js";

const pixelmatchThreshold = 0.15;
const failureThresholdRatio = 0.01;
const failureThresholdPixels = 2500;

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
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        reducedMotion: "reduce"
      });

      for (const route of selectedRoutes) {
        const siteDir = path.join(options.outputDir, site.id, viewport.name);
        await mkdir(siteDir, { recursive: true });
        const filePath = path.join(siteDir, `${safeFilenameFromUrl(route.url)}.png`);
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(30000);
        page.setDefaultTimeout(20000);

        try {
          await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
          await page.screenshot({ path: filePath, fullPage: true, animations: "disabled", timeout: 20000 });
          const metadata = await fileMetadata(filePath);
          const baselinePath = options.baselineDir
            ? path.join(options.baselineDir, site.id, viewport.name, `${safeFilenameFromUrl(route.url)}.png`)
            : undefined;
          const diffPath = options.diffDir
            ? path.join(options.diffDir, site.id, viewport.name, `${safeFilenameFromUrl(route.url)}.diff.png`)
            : undefined;
          const comparison = baselinePath
            ? await compareOrCreateBaseline(filePath, baselinePath, metadata.sha256, diffPath)
            : { baselineStatus: "not-checked" as const };
          artifacts.push({
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
            visualDiff: comparison.visualDiff
          });
        } catch (error) {
          artifacts.push({
            siteId: site.id,
            url: route.url,
            viewport,
            filePath,
            baselinePath: options.baselineDir
              ? path.join(options.baselineDir, site.id, viewport.name, `${safeFilenameFromUrl(route.url)}.png`)
              : undefined,
            diffPath: options.diffDir
              ? path.join(options.diffDir, site.id, viewport.name, `${safeFilenameFromUrl(route.url)}.diff.png`)
              : undefined,
            status: "failed",
            baselineStatus: "missing",
            error: error instanceof Error ? error.message : String(error)
          });
        } finally {
          await page.close().catch(() => undefined);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return artifacts;
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

async function fileMetadata(filePath: string): Promise<{ byteSize: number; sha256: string }> {
  const [stats, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
  return {
    byteSize: stats.size,
    sha256: createHash("sha256").update(bytes).digest("hex")
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
