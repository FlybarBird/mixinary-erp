-- Drop legacy Plane-era suite objects if present (from original 023).
-- Current 023 uses erp_pm_project_links; this migration only cleans old names.

drop table if exists public.erp_plane_project_links cascade;

-- Do not drop integration_outbox / idp columns here — they are reintroduced by 023
-- for Huly suite wiring. Only remove obsolete Plane-named link table.
