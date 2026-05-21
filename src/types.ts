export type SiteId = "production" | "staging";

export type RunMode =
  | "production-regression"
  | "staging-regression"
  | "all-sites"
  | "migration-compare"
  | "agent-readability";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "passed" | "warning" | "failed" | "changed" | "needs-review" | "accepted" | "archived";

export type CheckType =
  | "route-discovery"
  | "http"
  | "link-crawl"
  | "sitemap"
  | "agent-readability"
  | "screenshot"
  | "canonicalization"
  | "migration-compare"
  | "date-freshness";

export interface SiteConfig {
  id: SiteId;
  name: string;
  baseUrl: string;
  role: string;
  sitemapUrl: string | null;
  robotsUrl: string;
  timezone: string;
}

export interface RoutesConfig {
  site: SiteId;
  baseUrl: string;
  discovery: {
    strategy: string[];
    sitemap: string | null;
  };
  seedPaths: string[];
  knownFindings?: Array<{
    path: string;
    finding: string;
    expectedResolution: string;
  }>;
  canonicalizationChecks?: Array<{
    pattern: string;
    expected: string;
  }>;
}

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
}

export interface BrowserMatrixConfig {
  engines: string[];
  viewports: {
    core: ViewportConfig[];
    monthly: ViewportConfig[];
  };
  browsers: {
    p0: string[];
    p1: string[];
    p2AnalyticsDriven: string[];
  };
  notes: string[];
}

export interface DiscoveredRoute {
  siteId: SiteId;
  url: string;
  path: string;
  source: "sitemap" | "seed" | "crawl" | "surface";
  references: LinkReference[];
}

export interface LinkReference {
  sourceType: DiscoveredRoute["source"];
  sourceUrl: string;
  href: string;
  text?: string;
  section?: string;
  sourceAnchorUrl?: string;
}

export interface RedirectStep {
  from: string;
  to: string;
  status: number;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string;
  bodyText: string;
  redirectChain: RedirectStep[];
  error?: string;
}

export interface PageCheck {
  siteId: SiteId;
  url: string;
  finalUrl: string;
  path: string;
  source: DiscoveredRoute["source"];
  status: number;
  ok: boolean;
  contentType: string;
  title: string | null;
  internalLinks: string[];
  externalLinks: string[];
  dateTokens: string[];
  redirectChain: RedirectStep[];
  references: LinkReference[];
  agentSurface?: AgentSurface;
  error?: string;
}

export interface AgentSurface {
  hasCanonical: boolean;
  markdownAlternates: string[];
  llmsLinks: string[];
  sitemapLinks: string[];
  jsonLdCount: number;
  hasMain: boolean;
  h1Count: number;
  hasMetaDescription: boolean;
}

export interface ScreenshotArtifact {
  siteId: SiteId;
  url: string;
  viewport: ViewportConfig;
  filePath: string;
  baselinePath?: string;
  diffPath?: string;
  status: "captured" | "failed";
  baselineStatus?: "baseline-created" | "matched" | "changed" | "missing" | "not-checked";
  byteSize?: number;
  sha256?: string;
  visualDiff?: VisualDiffResult;
  error?: string;
}

export interface VisualDiffResult {
  mismatchPixels: number;
  mismatchRatio: number;
  width: number;
  height: number;
  currentWidth: number;
  currentHeight: number;
  baselineWidth: number;
  baselineHeight: number;
  pixelmatchThreshold: number;
  failureThresholdRatio: number;
  failureThresholdPixels: number;
}

export interface LinkIntentRecord {
  siteId: SiteId;
  sourceUrl: string;
  targetUrl: string;
  intent: string;
  confidence: "known" | "probable" | "unknown";
}

export interface ExternalTargetCheck {
  siteId: SiteId;
  targetUrl: string;
  finalUrl: string;
  intent: string;
  sourceUrls: string[];
  status: number;
  ok: boolean;
  contentType: string;
  title: string | null;
  freshnessStatus: "active-or-upcoming" | "past" | "unknown" | "not-applicable" | "failed";
  dateSignals: ExternalDateSignal[];
  redirectChain: RedirectStep[];
  error?: string;
}

export interface ExternalDateSignal {
  label: string;
  value: string;
  source: "json-ld" | "html";
  isoValue?: string;
}

export interface MigrationMapping {
  productionPath: string;
  stagingPath: string | null;
  intent: string;
  decision: "mapped" | "retired" | "manual-review";
}

export interface MigrationRecord extends MigrationMapping {
  productionUrl: string;
  stagingUrl: string | null;
  status: "mapped-ok" | "production-broken" | "staging-missing" | "retired" | "manual-review";
  productionStatus?: number;
  stagingStatus?: number;
}

export interface Finding {
  id: string;
  siteId: SiteId;
  url: string;
  checkType: CheckType;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
  description: string;
  expected?: string;
  actual?: string;
  evidence?: Record<string, unknown>;
}

export interface RunReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  mode: RunMode;
  sites: SiteId[];
  summary: {
    routesDiscovered: number;
    pagesChecked: number;
    screenshotsCaptured: number;
    findingsTotal: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  checks: PageCheck[];
  screenshots: ScreenshotArtifact[];
  linkIntents: LinkIntentRecord[];
  externalTargetChecks: ExternalTargetCheck[];
  migration: MigrationRecord[];
  findings: Finding[];
}
