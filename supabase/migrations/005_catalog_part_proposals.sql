-- Staging table for AI catalog scrape proposals (review-before-import)

create table if not exists public.catalog_part_proposals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs (id) on delete cascade,
  name text not null,
  sku text,
  upc text,
  description text,
  msrp numeric(14, 4),
  image_url text,
  product_url text,
  confidence numeric(6, 4),
  category_id uuid references public.part_categories (id) on delete set null,
  company_id uuid references public.part_companies (id) on delete set null,
  accepted boolean,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists catalog_part_proposals_job_idx
  on public.catalog_part_proposals (job_id);

alter table public.catalog_part_proposals enable row level security;

create policy "catalog_part_proposals_select" on public.catalog_part_proposals
  for select using (public.is_staff());

create policy "catalog_part_proposals_write" on public.catalog_part_proposals for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));
