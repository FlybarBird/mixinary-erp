
export const ERP_RESOURCE_LINKS = [
  { id: "overview", label: "ERP project overview", path: (id: string) => `/erp/projects/${id}` },
  { id: "bom", label: "BOM", path: (id: string) => `/projects/${id}` },
  { id: "labor", label: "Labor", path: (id: string) => `/projects/${id}/labor` },
  { id: "procurement", label: "Procurement", path: (id: string) => `/projects/${id}/procurement` },
  { id: "tracking", label: "Tracking", path: (id: string) => `/projects/${id}/tracking` },
  { id: "expenses", label: "Expenses", path: (id: string) => `/projects/${id}/expenses` },
  { id: "dashboard", label: "Dashboard", path: (id: string) => `/projects/${id}/dashboard` },
  { id: "client-documents", label: "Client Documents", path: (id: string) => `/projects/${id}/documents` },
  { id: "shared-files", label: "Shared project files", path: (id: string) => `/shared-files/projects/${id}` },
];
