export type SuiteAppId = "landing" | "erp" | "client-documents" | "admin";

export type SuiteApp = {
  id: SuiteAppId;
  label: string;
  href: string;
  description: string;
  external?: boolean;
};

/** Same-domain suite apps shown in the launcher and Apps dropdown. */
export function getSuiteApps(): SuiteApp[] {
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
      id: "client-documents",
      label: "Client Documents",
      href: "/client-documents",
      description: "Proposals, quotes, and e-sign",
    },
    {
      id: "admin",
      label: "Administration",
      href: "/admin",
      description: "Users and system settings",
    },
  ];
}
