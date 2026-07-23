PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'estimator',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
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
  status TEXT NOT NULL DEFAULT 'active',
  default_override_pct REAL NOT NULL DEFAULT 0,
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
  qty REAL NOT NULL DEFAULT 1,
  msrp REAL NOT NULL DEFAULT 0,
  quote REAL,
  override_pct REAL,
  vendor_id TEXT REFERENCES vendors(id),
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
