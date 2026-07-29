export const PROJECT_CSV_EXPORTS = [
  { label: "BOM", key: "bom" },
  { label: "Procurement / POs", key: "procurement" },
  { label: "Shipment Tracking", key: "tracking" },
  { label: "Labor (CSV)", key: "labor" },
  { label: "Labor (Excel)", key: "labor-xlsx" },
  { label: "Expenses", key: "expenses" },
] as const;

export const PROJECT_PDF_EXPORTS = [
  {
    label: "BOM — with pricing",
    href: (id: string) => `/api/projects/${id}/export/bom-pdf?pricing=1`,
  },
  {
    label: "BOM — without pricing",
    href: (id: string) => `/api/projects/${id}/export/bom-pdf?pricing=0`,
  },
  {
    label: "Labor — with pricing",
    href: (id: string) => `/api/projects/${id}/export/labor-pdf?pricing=1`,
  },
  {
    label: "Labor — without pricing",
    href: (id: string) => `/api/projects/${id}/export/labor-pdf?pricing=0`,
  },
  {
    label: "Invoice — BOM/Labor categories",
    href: (id: string) => `/api/projects/${id}/export/invoice-pdf`,
  },
] as const;
