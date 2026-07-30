
export type ErpResourceLink = {
  id: string;
  label: string;
  path: (erpProjectId: string) => string;
};

/** Build ERP deep links for the Resources panel (same-domain suite). */
export const ERP_RESOURCE_LINKS: ErpResourceLink[] = [
  { id: "overview", label: "ERP project overview", path: (id) => `/erp/projects/${id}` },
  { id: "bom", label: "BOM", path: (id) => `/projects/${id}` },
  { id: "labor", label: "Labor", path: (id) => `/projects/${id}/labor` },
  { id: "procurement", label: "Procurement", path: (id) => `/projects/${id}/procurement` },
  { id: "tracking", label: "Tracking", path: (id) => `/projects/${id}/tracking` },
  { id: "expenses", label: "Expenses", path: (id) => `/projects/${id}/expenses` },
  { id: "dashboard", label: "Dashboard", path: (id) => `/projects/${id}/dashboard` },
  { id: "client-documents", label: "Client Documents", path: (id) => `/projects/${id}/documents` },
  { id: "shared-files", label: "Shared project files", path: (id) => `/shared-files/projects/${id}` },
];

export function openErpProjectUrl(erpProjectId: string): string {
  return `/erp/projects/${erpProjectId}`;
}
