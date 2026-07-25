export const PROJECT_CSV_EXPORTS = [
  { label: "BOM (CSV)", key: "bom" },
  { label: "Procurement / POs (CSV)", key: "procurement" },
  { label: "Shipment Tracking (CSV)", key: "tracking" },
  { label: "Labor (CSV)", key: "labor" },
  { label: "Labor (Excel)", key: "labor-xlsx" },
  { label: "Expenses (CSV)", key: "expenses" },
] as const;

export const PROJECT_PDF_EXPORTS = [
  {
    label: "BOM PDF — with pricing",
    href: (id: string) => `/api/projects/${id}/export/bom-pdf?pricing=1`,
  },
  {
    label: "BOM PDF — without pricing",
    href: (id: string) => `/api/projects/${id}/export/bom-pdf?pricing=0`,
  },
  {
    label: "Labor PDF — with pricing",
    href: (id: string) => `/api/projects/${id}/export/labor-pdf?pricing=1`,
  },
  {
    label: "Labor PDF — without pricing",
    href: (id: string) => `/api/projects/${id}/export/labor-pdf?pricing=0`,
  },
  {
    label: "Invoice PDF — BOM/Labor categories",
    href: (id: string) => `/api/projects/${id}/export/invoice-pdf`,
  },
] as const;
