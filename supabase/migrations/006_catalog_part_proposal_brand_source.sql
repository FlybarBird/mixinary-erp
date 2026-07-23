-- Brand / company / source text captured during catalog scrape

alter table public.catalog_part_proposals
  add column if not exists brand text;

alter table public.catalog_part_proposals
  add column if not exists company_name text;

alter table public.catalog_part_proposals
  add column if not exists source_name text;
