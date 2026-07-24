export type UserRole =
  | "administrator"
  | "project_manager"
  | "purchasing"
  | "warehouse"
  | "accounting"
  | "field"
  | "read_only";

/** @deprecated Legacy roles — normalize via normalizeUserRole() */
export type LegacyUserRole = "admin" | "estimator" | "tech";

export const USER_ROLES: UserRole[] = [
  "administrator",
  "project_manager",
  "purchasing",
  "warehouse",
  "accounting",
  "field",
  "read_only",
];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  administrator: "Administrator",
  project_manager: "Project Manager",
  purchasing: "Purchasing",
  warehouse: "Warehouse / Receiving",
  accounting: "Accounting",
  field: "Field / Production",
  read_only: "Read-Only",
};

export function normalizeUserRole(role: string | null | undefined): UserRole {
  switch (role) {
    case "admin":
    case "administrator":
      return "administrator";
    case "estimator":
    case "project_manager":
      return "project_manager";
    case "purchasing":
      return "purchasing";
    case "warehouse":
      return "warehouse";
    case "accounting":
      return "accounting";
    case "tech":
    case "field":
      return "field";
    case "read_only":
      return "read_only";
    default:
      return "read_only";
  }
}

export type OrderStatus = "none" | "ordered" | "shipped";

export type ProcurementStatus =
  | "not_ordered"
  | "partially_ordered"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export type PoStatus =
  | "draft"
  | "ready_to_order"
  | "ordered"
  | "confirmed"
  | "partially_shipped"
  | "shipped"
  | "partially_received"
  | "received"
  | "on_hold"
  | "closed"
  | "cancelled";

export type PoItemStatus =
  | "not_ordered"
  | "ordered"
  | "confirmed"
  | "preparing"
  | "backordered"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "partially_received"
  | "received"
  | "delayed"
  | "cancelled";

export type ExpenseCategory =
  | "shipping_freight"
  | "equipment_rental"
  | "travel"
  | "lodging"
  | "meals"
  | "permits"
  | "subcontractors"
  | "tools_supplies"
  | "miscellaneous";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type PaymentStatus = "unpaid" | "paid" | "reimbursed";

export type ProjectStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "complete"
  | "archived";
export type AiJobType = "msrp_fetch" | "pdf_quote" | "catalog_scrape";
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
  active?: boolean;
}

export type ProjectAccessRole = "viewer" | "editor" | "manager";

export const PROJECT_ACCESS_ROLES: ProjectAccessRole[] = [
  "viewer",
  "editor",
  "manager",
];

export const PROJECT_ACCESS_LABELS: Record<ProjectAccessRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  manager: "Manager",
};

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  access_role: ProjectAccessRole;
  user_profiles?: Pick<UserProfile, "id" | "email" | "full_name" | "role"> | null;
}

export interface UserAuditEvent {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  details: string | Record<string, unknown> | null;
  created_at: string;
}

export interface UserInvite {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  token: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface Client {
  id: string;
  name: string;
  code: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  account_number: string | null;
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
  project_manager_id?: string | null;
  status: ProjectStatus;
  default_override_pct: number;
  material_budget?: number | null;
  labor_budget?: number | null;
  notes: string | null;
  created_at?: string;
  clients?: Client | null;
  project_manager?: UserProfile | null;
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
  category?: string | null;
  uom?: string | null;
  qty: number;
  msrp: number;
  quote: number | null;
  override_pct: number | null;
  estimated_unit_cost?: number | null;
  required_by_date?: string | null;
  procurement_status?: ProcurementStatus | null;
  qty_ordered?: number | null;
  qty_received?: number | null;
  vendor_id: string | null;
  catalog_part_id?: string | null;
  order_status: OrderStatus;
  tracking: string | null;
  carrier_id: string | null;
  notes: string | null;
  fetch_error: string | null;
  msrp_source_url: string | null;
  msrp_fetched_at: string | null;
  vendors?: Vendor | null;
}

export interface PurchaseOrder {
  id: string;
  project_id: string;
  vendor_id: string;
  po_number: string;
  order_date: string | null;
  ordered_by: string | null;
  status: PoStatus;
  expected_delivery_date: string | null;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  sale_total?: number;
  profit?: number;
  margin_pct?: number | null;
  vendor_contact: string | null;
  notes: string | null;
  vendors?: Vendor | null;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  line_item_id: string | null;
  sku: string | null;
  vendor_sku: string | null;
  description: string;
  qty_ordered: number;
  unit_price: number;
  line_total: number;
  shipping: number;
  sale_total?: number;
  allocated_shipping?: number;
  allocated_tax?: number;
  cost_total?: number;
  profit?: number;
  margin_pct?: number | null;
  expected_ship_date: string | null;
  expected_delivery_date: string | null;
  qty_shipped: number;
  qty_received: number;
  item_status: PoItemStatus;
  carrier_id: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  latest_tracking_update: string | null;
  notes: string | null;
}

export interface TrackingEvent {
  id: string;
  po_item_id: string;
  event_at: string;
  status: string;
  message: string | null;
  created_by: string | null;
}

export interface LaborEntry {
  id: string;
  project_id: string;
  worker_name: string;
  user_id: string | null;
  work_category: string | null;
  task_description: string | null;
  work_date: string;
  estimated_hours: number;
  actual_hours: number;
  regular_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  total_cost: number;
  approval_status: ApprovalStatus;
  notes: string | null;
  created_by: string | null;
}

export interface ProjectExpense {
  id: string;
  project_id: string;
  expense_date: string;
  category: ExpenseCategory;
  payee: string | null;
  description: string;
  amount: number;
  tax: number;
  cost_code: string | null;
  submitted_by: string | null;
  approval_status: ApprovalStatus;
  payment_status: PaymentStatus;
  is_additional_charge: boolean;
  receipt_path: string | null;
  notes: string | null;
}

export interface Attachment {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  file_path: string;
  file_name: string;
  uploaded_by: string | null;
  created_at?: string;
}

export interface AuditEvent {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: unknown;
  after_json: unknown;
  actor_id: string | null;
  created_at?: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at?: string;
}

export interface PartCategory {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export interface PartCompany {
  id: string;
  name: string;
  website: string | null;
  logo_path: string | null;
  notes: string | null;
  icecat_vendor_name: string | null;
}

export interface CatalogPart {
  id: string;
  sku: string | null;
  upc: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  company_id: string | null;
  default_vendor_id: string | null;
  msrp: number;
  default_quote: number | null;
  image_path: string | null;
  image_url: string | null;
  specs: Record<string, unknown> | null;
  source: string;
  active: boolean;
  part_categories?: PartCategory | null;
  part_companies?: PartCompany | null;
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

export interface CatalogPartProposal {
  id: string;
  job_id: string;
  name: string;
  sku: string | null;
  upc: string | null;
  description: string | null;
  msrp: number | null;
  image_url: string | null;
  product_url: string | null;
  brand: string | null;
  company_name: string | null;
  source_name: string | null;
  confidence: number | null;
  category_id: string | null;
  company_id: string | null;
  accepted: boolean | null;
  raw: Record<string, unknown> | null;
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

export interface TemplateSection {
  id: string;
  template_id: string;
  name: string;
  sort_order: number;
}

export interface TemplateLineItem {
  id: string;
  template_id: string;
  section_id: string | null;
  sort_order: number;
  description: string;
  sku: string | null;
  qty: number;
  msrp: number;
  quote: number | null;
  override_pct: number | null;
  vendor_code: string | null;
  notes: string | null;
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
