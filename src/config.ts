import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserMatrixConfig, CtaRulesConfig, MigrationMapping, RoutesConfig, SiteConfig, SiteId, ViewportConfig } from "./types.js";

const repoRoot = process.cwd();

async function readJson<T>(relativePath: string): Promise<T> {
  const absolutePath = path.join(repoRoot, relativePath);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function loadSites(): Promise<SiteConfig[]> {
  const config = await readJson<{ sites: SiteConfig[] }>("config/sites.json");
  return config.sites;
}

export async function loadRoutesConfig(siteId: SiteId): Promise<RoutesConfig> {
  return readJson<RoutesConfig>(`config/routes.${siteId}.json`);
}

export async function loadBrowserMatrix(): Promise<BrowserMatrixConfig> {
  return readJson<BrowserMatrixConfig>("config/browser-matrix.json");
}

export async function loadMigrationMap(): Promise<MigrationMapping[]> {
  const config = await readJson<{ mappings: MigrationMapping[] }>("config/migration-map.json");
  return config.mappings;
}

export async function loadCtaRules(): Promise<CtaRulesConfig> {
  return readJson<CtaRulesConfig>("config/cta-rules.json");
}

export function selectViewports(matrix: BrowserMatrixConfig, names: string[]): ViewportConfig[] {
  const all = [...matrix.viewports.core, ...matrix.viewports.monthly];
  const aliases: Record<string, string> = {
    mobile: "iphone-modern",
    tablet: "ipad-classic",
    "tablet-landscape-classic": "tablet-landscape-classic",
    "13-inch": "laptop-13",
    "laptop-13": "laptop-13",
    desktop: "small-laptop",
    wide: "macbook",
    hd: "desktop-hd"
  };

  return names.map((name) => {
    const resolvedName = aliases[name] ?? name;
    const viewport = all.find((item) => item.name === resolvedName);
    if (!viewport) {
      throw new Error(`Unknown viewport "${name}". Known viewports: ${all.map((item) => item.name).join(", ")}`);
    }
    return viewport;
  });
}

export function getRepoRoot(): string {
  return repoRoot;
}
