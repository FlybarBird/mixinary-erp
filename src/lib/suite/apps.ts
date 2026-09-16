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

/** Same-domain suite apps (Cloudflare routes PM / auth / files). */
export function getSuiteApps(): SuiteApp[] {
  const pmBase =
    process.env.NEXT_PUBLIC_PM_BASE_PATH?.trim() || "/project-management";
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

/** Deep-link into OpenProject project by numeric id or identifier. */
export function projectManagementOpenUrl(pmProjectId?: string | null) {
  const pmBase =
    process.env.NEXT_PUBLIC_PM_BASE_PATH?.trim() || "/project-management";
  if (!pmProjectId) return pmBase;
  return `${pmBase.replace(/\/$/, "")}/projects/${pmProjectId}`;
}
