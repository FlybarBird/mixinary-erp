import {
  isExternalPmBase,
  projectManagementOpenUrl,
  resolvePmBasePath,
} from "@/lib/suite/pm-base";

export type SuiteAppId =
  | "landing"
  | "erp"
  | "pm"
  | "client-documents"
  | "admin";

export type SuiteApp = {
  id: SuiteAppId;
  label: string;
  href: string;
  description: string;
  external?: boolean;
};

export { projectManagementOpenUrl, resolvePmBasePath };

/** Same-domain suite apps (Cloudflare routes PM / auth / files). */
export function getSuiteApps(): SuiteApp[] {
  const pmBase = resolvePmBasePath();
  return [
    {
      id: "landing",
      label: "Suite Home",
      href: "/apps",
      description: "Choose an application",
    },
    {
      id: "erp",
      label: "ERP",
      href: "/erp",
      description: "Projects, BOM, procurement, and financials",
    },
    {
      id: "pm",
      label: "Project Management",
      href: pmBase,
      description: "Tasks, work packages, and execution (OpenProject)",
      // Full page to OpenProject (relative or absolute) — not a Next.js route.
      external: true,
    },
    {
      id: "client-documents",
      label: "Client Documents",
      href: "/client-documents",
      description: "Proposals, quotes, and e-sign",
    },
    {
      id: "admin",
      label: "Administration",
      href: "/admin",
      description: "Users, suite integrations, and system settings",
    },
  ];
}

/** @deprecated Prefer resolvePmBasePath — kept for clarity at call sites. */
export function pmBaseIsAbsolute() {
  return isExternalPmBase();
}
