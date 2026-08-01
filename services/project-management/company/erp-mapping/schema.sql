
-- Isolated ERP relationship mapping (Huly-side company module)
CREATE TABLE IF NOT EXISTS mixinary_erp_project_map (
  id UUID PRIMARY KEY,
  huly_project_id TEXT NOT NULL UNIQUE,
  erp_company_id TEXT,
  erp_project_id TEXT NOT NULL,
  erp_project_number TEXT,
  erp_project_url TEXT,
  integration_status TEXT NOT NULL DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mixinary_erp_project_map_erp_unique UNIQUE (erp_project_id)
);
