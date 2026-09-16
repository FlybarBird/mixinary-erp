/**
 * Resolve the suite Project Management base URL/path.
 *
 * Prefer same-origin OpenProject at `/project-management`.
 * Legacy Plane hosts (e.g. plane-mixinary.shadowvis.com) are ignored so stale
 * Vercel env vars cannot keep sending users to the old Plane deploy.
 */

const DEFAULT_PM_BASE = "/project-management";

const LEGACY_PM_HOST_SNIPPETS = [
  "plane-mixinary",
  "plane-mixinary.shadowvis.com",
];

function isLegacyPmHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LEGACY_PM_HOST_SNIPPETS.some((s) => host.includes(s))) return true;
  // plane.example.com / app.plane.example.com style hosts from old Plane deploys
  if (host === "plane" || host.startsWith("plane.") || host.includes(".plane.")) {
    return true;
  }
  return false;
}

function looksLikeAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Returns a path (`/project-management`) or absolute OpenProject origin+path.
 * Never returns a legacy Plane URL.
 */
export function resolvePmBasePath(
  raw:
    | string
    | undefined
    | null = process.env.NEXT_PUBLIC_PM_BASE_PATH ??
    process.env.NEXT_PUBLIC_PM_BASE_URL,
): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "") || DEFAULT_PM_BASE;

  if (looksLikeAbsoluteUrl(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (isLegacyPmHost(url.hostname)) {
        return DEFAULT_PM_BASE;
      }
      // Absolute OpenProject URL — keep origin + pathname (or default path)
      const path =
        url.pathname && url.pathname !== "/"
          ? url.pathname.replace(/\/+$/, "")
          : DEFAULT_PM_BASE;
      return `${url.origin}${path}`;
    } catch {
      return DEFAULT_PM_BASE;
    }
  }

  // Relative path — reject accidental "plane-..." path segments
  if (/plane/i.test(trimmed) && !/project-management/i.test(trimmed)) {
    return DEFAULT_PM_BASE;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function projectManagementOpenUrl(pmProjectId?: string | null) {
  const pmBase = resolvePmBasePath();
  if (!pmProjectId) return pmBase;
  return `${pmBase.replace(/\/$/, "")}/projects/${pmProjectId}`;
}

export function isExternalPmBase(pmBase: string = resolvePmBasePath()): boolean {
  return looksLikeAbsoluteUrl(pmBase);
}
