import {
  projectManagementOpenUrl,
  resolvePmBasePath,
  suitePmLauncherHref,
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

export { projectManagementOpenUrl, resolvePmBasePath, suitePmLauncherHref };

/** Same-domain suite apps (Cloudflare routes PM / auth / files). */
export function getSuiteApps(): SuiteApp[] {
  const pmHref = suitePmLauncherHref();
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
      href: pmHref,
      description: "OpenProject — tasks, work packages, and execution",
      // Full navigation to OpenProject (not an App Router page).
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
