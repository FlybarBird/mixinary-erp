export type UserRole = "admin" | "estimator" | "tech";
export type OrderStatus = "none" | "ordered" | "shipped";
export type ProjectStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "complete"
  | "archived";
export type AiJobType = "msrp_fetch" | "pdf_quote";
export type AiJobStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "applied"
  | "failed"
  | "rejected";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  notes: string | null;
}

export interface Carrier {
  id: string;
  name: string;
  slug: string;
}

export interface Project {
  id: string;
  project_number: string;
  name: string;
  client_id: string | null;
  status: ProjectStatus;
  default_override_pct: number;
  notes: string | null;
  created_at?: string;
  clients?: Client | null;
}

export interface ProjectSection {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
}

export interface LineItem {
  id: string;
  project_id: string;
  section_id: string | null;
  sort_order: number;
  description: string;
  sku: string | null;
  qty: number;
  msrp: number;
  quote: number | null;
  override_pct: number | null;
  vendor_id: string | null;
  order_status: OrderStatus;
  tracking: string | null;
  carrier_id: string | null;
  notes: string | null;
  fetch_error: string | null;
  msrp_source_url: string | null;
  msrp_fetched_at: string | null;
  vendors?: Vendor | null;
}

export interface PriceSource {
  id: string;
  name: string;
  base_domain: string;
  search_url_template: string | null;
  enabled: boolean;
  supports_search: boolean;
  notes: string | null;
}

export interface AiJob {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  project_id: string | null;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceFetchResult {
  id: string;
  job_id: string;
  line_item_id: string | null;
  price_source_id: string | null;
  product_name: string | null;
  sku: string | null;
  msrp: number | null;
  currency: string | null;
  source_url: string | null;
  confidence: number | null;
  accepted: boolean | null;
}

export interface QuoteUpload {
  id: string;
  project_id: string;
  job_id: string | null;
  file_path: string;
  file_name: string;
  vendor_hint: string | null;
  status: AiJobStatus;
  quote_number: string | null;
  quote_date: string | null;
}

export interface QuoteExtractedLine {
  id: string;
  upload_id: string;
  sort_order: number;
  sku: string | null;
  description: string | null;
  qty: number | null;
  unit_price: number | null;
  ext_price: number | null;
  vendor: string | null;
  matched_line_item_id: string | null;
  match_score: number | null;
  action: string | null;
  selected: boolean;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  default_override_pct: number;
}

export interface LinePricing {
  qty: number;
  msrp: number;
  unitQuote: number;
  totalMsrp: number;
  totalQuote: number;
  overridePct: number;
  unitSale: number;
  totalSale: number;
  clientSavings: number;
  outOfPocket: number;
}
