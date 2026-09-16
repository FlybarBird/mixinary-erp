/**
 * Suite Project Management base for app launcher / deep links.
 *
 * Always prefer same-origin OpenProject. Legacy Plane hosts (e.g.
 * plane-mixinary.shadowvis.com) are never returned — even if still set in env.
 */

export const OPENPROJECT_SUITE_PATH = "/project-management";

const LEGACY_PM_HOST_SNIPPETS = [
  "plane-mixinary",
  "plane-mixinary.shadowvis.com",
];

function isLegacyPmHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LEGACY_PM_HOST_SNIPPETS.some((s) => host.includes(s))) return true;
  if (host === "plane" || host.startsWith("plane.") || host.includes(".plane.")) {
    return true;
  }
  return false;
}

function looksLikeAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Base href for Apps launcher + dropdown (OpenProject).
 * Env overrides are allowed only for non-Plane absolute OpenProject URLs;
 * otherwise this is always `/project-management`.
 */
export function resolvePmBasePath(
  raw:
    | string
    | undefined
    | null = process.env.NEXT_PUBLIC_PM_BASE_PATH ??
    process.env.NEXT_PUBLIC_PM_BASE_URL,
): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");

  // No override → suite path
  if (!trimmed) return OPENPROJECT_SUITE_PATH;

  if (looksLikeAbsoluteUrl(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (isLegacyPmHost(url.hostname)) {
        return OPENPROJECT_SUITE_PATH;
      }
      const path =
        url.pathname && url.pathname !== "/"
          ? url.pathname.replace(/\/+$/, "")
          : OPENPROJECT_SUITE_PATH;
      return `${url.origin}${path}`;
    } catch {
      return OPENPROJECT_SUITE_PATH;
    }
  }

  if (/plane/i.test(trimmed) && !/project-management/i.test(trimmed)) {
    return OPENPROJECT_SUITE_PATH;
  }

  // Relative override must still land under OpenProject suite path when empty/odd
  if (trimmed === "/" || trimmed === "") return OPENPROJECT_SUITE_PATH;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** App launcher / dropdown always use the suite OpenProject path (never Plane). */
export function suitePmLauncherHref(): string {
  // Intentionally ignore absolute cross-host overrides for the suite chrome —
  // Cloudflare serves OpenProject under the same host at /project-management.
  return OPENPROJECT_SUITE_PATH;
}

export function projectManagementOpenUrl(pmProjectId?: string | null) {
  const pmBase = resolvePmBasePath();
  if (!pmProjectId) return pmBase;
  return `${pmBase.replace(/\/$/, "")}/projects/${pmProjectId}`;
}

export function isExternalPmBase(pmBase: string = resolvePmBasePath()): boolean {
  return looksLikeAbsoluteUrl(pmBase);
}
