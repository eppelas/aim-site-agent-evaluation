import type { FetchResult, RedirectStep } from "./types.js";

const userAgent = "AI Mindset Site Agent Evaluation/0.1 (+https://aimindset.org)";

export async function fetchWithRedirects(url: string, maxRedirects = 10): Promise<FetchResult> {
  const redirectChain: RedirectStep[] = [];
  let currentUrl = url;

  for (let redirectIndex = 0; redirectIndex <= maxRedirects; redirectIndex += 1) {
    const fetchAttempt = await fetchWithRetry(currentUrl);
    if (!fetchAttempt.response) {
      return {
        url,
        finalUrl: currentUrl,
        status: 0,
        ok: false,
        contentType: "",
        bodyText: "",
        redirectChain,
        error: fetchAttempt.error
      };
    }
    const response = fetchAttempt.response;

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return await responseToResult(url, currentUrl, response, redirectChain);
      }
      const nextUrl = new URL(location, currentUrl).toString();
      redirectChain.push({ from: currentUrl, to: nextUrl, status: response.status });
      currentUrl = nextUrl;
      continue;
    }

    return responseToResult(url, currentUrl, response, redirectChain);
  }

  return {
    url,
    finalUrl: currentUrl,
    status: 0,
    ok: false,
    contentType: "",
    bodyText: "",
    redirectChain,
    error: `Exceeded ${maxRedirects} redirects`
  };
}

async function fetchWithRetry(url: string): Promise<{ response?: Response; error?: string }> {
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8"
        }
      });
      return { response };
    } catch (error) {
      lastError = error instanceof Error ? `${error.message}${error.cause ? `: ${String(error.cause)}` : ""}` : String(error);
      if (attempt < 3) await sleep(300 * attempt);
    }
  }

  return { error: lastError || "fetch failed" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responseToResult(
  originalUrl: string,
  finalUrl: string,
  response: Response,
  redirectChain: RedirectStep[]
): Promise<FetchResult> {
  const contentType = response.headers.get("content-type") ?? "";
  let bodyText = "";

  if (
    contentType.includes("text/") ||
    contentType.includes("application/xml") ||
    contentType.includes("application/xhtml+xml") ||
    contentType.includes("application/json")
  ) {
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }
  }

  return {
    url: originalUrl,
    finalUrl,
    status: response.status,
    ok: response.ok,
    contentType,
    bodyText,
    redirectChain
  };
}
