/**
 * Shared public HTML fetch for MSRP / catalog scrape.
 * Some retailers (e.g. Sweetwater) block datacenter + generic bot UAs via PerimeterX;
 * retry with link-preview UAs that their edge already allows.
 */

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** Link-unfurl UAs that several AV retailers allow through bot walls. */
export const FETCH_USER_AGENTS = [
  BROWSER_USER_AGENT,
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
] as const;

const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

export function isBotWallHtml(html: string, status?: number): boolean {
  if (status === 403 || status === 429 || status === 503) {
    const lower = html.toLowerCase();
    if (
      lower.includes("px-captcha") ||
      lower.includes("perimeterx") ||
      lower.includes("access to this page has been denied") ||
      lower.includes("just a moment") ||
      lower.includes("cf-challenge") ||
      lower.includes("attention required") ||
      lower.includes("_pxappid") ||
      html.length < 8_000
    ) {
      return true;
    }
  }

  const sample = html.slice(0, 12_000).toLowerCase();
  return (
    sample.includes('content="px-captcha"') ||
    sample.includes("/* perimeterx") ||
    sample.includes("press & hold to confirm you are") ||
    (sample.includes("just a moment") && sample.includes("cloudflare")) ||
    sample.includes("enable javascript and cookies to continue")
  );
}

export type FetchedHtml = {
  html: string;
  finalUrl: string;
  status: number;
  userAgent: string;
};

export async function fetchHtmlDocument(
  url: string,
  options?: { timeoutMs?: number; userAgents?: readonly string[] },
): Promise<FetchedHtml> {
  const timeoutMs = options?.timeoutMs ?? 25_000;
  const agents = options?.userAgents?.length
    ? options.userAgents
    : FETCH_USER_AGENTS;

  let lastError: Error | null = null;

  for (const userAgent of agents) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: DEFAULT_ACCEPT,
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      const html = await res.text();
      const finalUrl = res.url || url;

      if (!res.ok || isBotWallHtml(html, res.status)) {
        lastError = new Error(
          `Fetch blocked (${res.status}) for ${url}` +
            (isBotWallHtml(html, res.status) ? " — bot/captcha wall" : ""),
        );
        continue;
      }

      return { html, finalUrl, status: res.status, userAgent };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(`Fetch failed for ${url}`);
}
