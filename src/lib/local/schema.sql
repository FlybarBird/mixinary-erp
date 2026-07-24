PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'project_manager',
  password_hash TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  project_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id),
  project_manager_id TEXT REFERENCES user_profiles(id),
  status TEXT NOT NULL DEFAULT 'active',
  default_override_pct REAL NOT NULL DEFAULT 0,
  material_budget REAL,
  labor_budget REAL,
  expense_budget REAL,
  subcontractor_budget REAL,
  overhead_budget REAL,
  original_revenue REAL,
  revenue_additions REAL NOT NULL DEFAULT 0,
  revenue_credits REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  target_completion_date TEXT,
  percent_complete REAL NOT NULL DEFAULT 0,
  financials_updated_at TEXT,
  labor_burden_enabled INTEGER NOT NULL DEFAULT 0,
  default_burden_pct REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS line_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES project_sections(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  uom TEXT DEFAULT 'ea',
  qty REAL NOT NULL DEFAULT 1,
  msrp REAL NOT NULL DEFAULT 0,
  quote REAL,
  override_pct REAL,
  estimated_unit_cost REAL,
  required_by_date TEXT,
  procurement_status TEXT DEFAULT 'not_ordered',
  qty_ordered REAL NOT NULL DEFAULT 0,
  qty_received REAL NOT NULL DEFAULT 0,
  vendor_id TEXT REFERENCES vendors(id),
  catalog_part_id TEXT,
  order_status TEXT NOT NULL DEFAULT 'none',
  tracking TEXT,
  carrier_id TEXT REFERENCES carriers(id),
  notes TEXT,
  fetch_error TEXT,
  msrp_source_url TEXT,
  msrp_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS part_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES part_categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS part_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  website TEXT,
  logo_path TEXT,
  notes TEXT,
  icecat_vendor_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS catalog_parts (
  id TEXT PRIMARY KEY,
  sku TEXT,
  upc TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id TEXT REFERENCES part_categories(id),
  company_id TEXT REFERENCES part_companies(id),
  default_vendor_id TEXT REFERENCES vendors(id),
  msrp REAL NOT NULL DEFAULT 0,
  default_quote REAL,
  image_path TEXT,
  image_url TEXT,
  specs TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS catalog_parts_sku_idx ON catalog_parts(sku);
CREATE INDEX IF NOT EXISTS catalog_parts_name_idx ON catalog_parts(name);
CREATE INDEX IF NOT EXISTS catalog_parts_category_idx ON catalog_parts(category_id);
CREATE INDEX IF NOT EXISTS catalog_parts_company_idx ON catalog_parts(company_id);

CREATE TABLE IF NOT EXISTS project_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_override_pct REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS template_sections (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_line_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES template_sections(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  sku TEXT,
  qty REAL NOT NULL DEFAULT 1,
  msrp REAL NOT NULL DEFAULT 0,
  quote REAL,
  override_pct REAL,
  vendor_code TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS price_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_domain TEXT NOT NULL UNIQUE,
  search_url_template TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  supports_search INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT,
  input TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_fetch_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  line_item_id TEXT REFERENCES line_items(id) ON DELETE CASCADE,
  price_source_id TEXT REFERENCES price_sources(id),
  product_name TEXT,
  sku TEXT,
  msrp REAL,
  currency TEXT DEFAULT 'USD',
  source_url TEXT,
  confidence REAL,
  accepted INTEGER,
  raw TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS catalog_part_proposals (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  upc TEXT,
  description TEXT,
  msrp REAL,
  image_url TEXT,
  product_url TEXT,
  brand TEXT,
  company_name TEXT,
  source_name TEXT,
  confidence REAL,
  category_id TEXT REFERENCES part_categories(id),
  company_id TEXT REFERENCES part_companies(id),
  accepted INTEGER,
  raw TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS catalog_part_proposals_job_idx
  ON catalog_part_proposals(job_id);

CREATE TABLE IF NOT EXISTS quote_uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES ai_jobs(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  vendor_hint TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  quote_number TEXT,
  quote_date TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_extracted_lines (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL REFERENCES quote_uploads(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sku TEXT,
  description TEXT,
  qty REAL,
  unit_price REAL,
  ext_price REAL,
  vendor TEXT,
  matched_line_item_id TEXT REFERENCES line_items(id),
  match_score REAL,
  action TEXT DEFAULT 'update_quote',
  selected INTEGER NOT NULL DEFAULT 1,
  raw TEXT
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  po_number TEXT NOT NULL,
  order_date TEXT,
  ordered_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  expected_delivery_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  sale_total REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  margin_pct REAL,
  vendor_contact TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_item_id TEXT REFERENCES line_items(id),
  sku TEXT,
  vendor_sku TEXT,
  description TEXT NOT NULL,
  qty_ordered REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  sale_total REAL NOT NULL DEFAULT 0,
  allocated_shipping REAL NOT NULL DEFAULT 0,
  allocated_tax REAL NOT NULL DEFAULT 0,
  cost_total REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  margin_pct REAL,
  expected_ship_date TEXT,
  expected_delivery_date TEXT,
  qty_shipped REAL NOT NULL DEFAULT 0,
  qty_received REAL NOT NULL DEFAULT 0,
  item_status TEXT NOT NULL DEFAULT 'not_ordered',
  carrier_id TEXT REFERENCES carriers(id),
  tracking_number TEXT,
  tracking_url TEXT,
  latest_tracking_update TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracking_events (
  id TEXT PRIMARY KEY,
  po_item_id TEXT NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  event_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,
  message TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labor_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  user_id TEXT,
  work_category TEXT,
  task_description TEXT,
  work_date TEXT NOT NULL,
  estimated_hours REAL NOT NULL DEFAULT 0,
  actual_hours REAL NOT NULL DEFAULT 0,
  regular_hours REAL NOT NULL DEFAULT 0,
  overtime_hours REAL NOT NULL DEFAULT 0,
  hourly_rate REAL NOT NULL DEFAULT 0,
  burden_pct REAL NOT NULL DEFAULT 0,
  billing_rate REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_expenses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'miscellaneous',
  payee TEXT,
  description TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  cost_code TEXT,
  po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  submitted_by TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  is_additional_charge INTEGER NOT NULL DEFAULT 0,
  receipt_path TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_cost_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  vendor_or_person TEXT,
  description TEXT,
  budget_amount REAL NOT NULL DEFAULT 0,
  committed_amount REAL NOT NULL DEFAULT 0,
  actual_amount REAL NOT NULL DEFAULT 0,
  forecast_amount REAL NOT NULL DEFAULT 0,
  transaction_date TEXT,
  approval_status TEXT,
  payment_status TEXT,
  billable INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_type, source_id, category)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'project_manager',
  token TEXT NOT NULL UNIQUE,
  invited_by TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
  accepted_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  access_role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_change_orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  co_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  revenue_delta REAL NOT NULL DEFAULT 0,
  budget_material_delta REAL NOT NULL DEFAULT 0,
  budget_labor_delta REAL NOT NULL DEFAULT 0,
  budget_expense_delta REAL NOT NULL DEFAULT 0,
  budget_subcontractor_delta REAL NOT NULL DEFAULT 0,
  budget_overhead_delta REAL NOT NULL DEFAULT 0,
  requested_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  effective_date TEXT,
  customer_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, co_number)
);

CREATE TABLE IF NOT EXISTS project_invoices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  notes TEXT,
  sent_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS project_invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  change_order_id TEXT REFERENCES project_change_orders(id) ON DELETE SET NULL,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_payments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_payment_applications (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES project_payments(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0,
  UNIQUE (payment_id, invoice_id)
);

CREATE TABLE IF NOT EXISTS project_financial_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  trigger TEXT NOT NULL DEFAULT 'manual',
  current_revenue REAL,
  original_cost_budget REAL,
  revised_cost_budget REAL,
  committed REAL NOT NULL DEFAULT 0,
  actual REAL NOT NULL DEFAULT 0,
  forecast_final REAL NOT NULL DEFAULT 0,
  forecast_profit REAL,
  forecast_margin REAL,
  billed REAL NOT NULL DEFAULT 0,
  collected REAL NOT NULL DEFAULT 0,
  ar_outstanding REAL NOT NULL DEFAULT 0,
  material_sale REAL NOT NULL DEFAULT 0,
  material_only_profit REAL NOT NULL DEFAULT 0,
  percent_complete REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vendor_bills (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_invoice_number TEXT,
  bill_date TEXT,
  due_date TEXT,
  amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'accrued',
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_subcontracts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  sub_name TEXT,
  description TEXT NOT NULL,
  contract_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  billed_to_date REAL NOT NULL DEFAULT 0,
  paid_to_date REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_subcontract_bills (
  id TEXT PRIMARY KEY,
  subcontract_id TEXT NOT NULL REFERENCES project_subcontracts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bill_date TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'billed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS purchase_orders_project_idx ON purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS labor_entries_project_idx ON labor_entries(project_id);
CREATE INDEX IF NOT EXISTS project_expenses_project_idx ON project_expenses(project_id);
CREATE INDEX IF NOT EXISTS project_cost_ledger_project_idx ON project_cost_ledger(project_id);
CREATE INDEX IF NOT EXISTS project_cost_ledger_category_idx ON project_cost_ledger(project_id, category);
CREATE INDEX IF NOT EXISTS project_change_orders_project_idx ON project_change_orders(project_id);
CREATE INDEX IF NOT EXISTS project_invoices_project_idx ON project_invoices(project_id);
CREATE INDEX IF NOT EXISTS project_payments_project_idx ON project_payments(project_id);
CREATE INDEX IF NOT EXISTS project_financial_snapshots_project_idx ON project_financial_snapshots(project_id);
CREATE INDEX IF NOT EXISTS vendor_bills_project_idx ON vendor_bills(project_id);
CREATE INDEX IF NOT EXISTS project_subcontracts_project_idx ON project_subcontracts(project_id);
CREATE INDEX IF NOT EXISTS attachments_project_idx ON attachments(project_id);
CREATE INDEX IF NOT EXISTS audit_events_project_idx ON audit_events(project_id);
CREATE INDEX IF NOT EXISTS app_notifications_user_idx ON app_notifications(user_id);
CREATE INDEX IF NOT EXISTS user_audit_events_created_idx ON user_audit_events(created_at);
CREATE INDEX IF NOT EXISTS project_members_project_idx ON project_members(project_id);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members(user_id);
