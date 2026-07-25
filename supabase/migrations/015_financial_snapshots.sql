-- Phase 5: Financial snapshots for profit waterfall history
create table if not exists public.project_financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  captured_at timestamptz not null default now(),
  trigger text not null default 'manual',
  current_revenue numeric,
  original_cost_budget numeric,
  revised_cost_budget numeric,
  committed numeric not null default 0,
  actual numeric not null default 0,
  forecast_final numeric not null default 0,
  forecast_profit numeric,
  forecast_margin numeric,
  billed numeric not null default 0,
  collected numeric not null default 0,
  ar_outstanding numeric not null default 0,
  material_sale numeric not null default 0,
  material_only_profit numeric not null default 0,
  percent_complete numeric not null default 0
);

create index if not exists project_financial_snapshots_project_idx
  on public.project_financial_snapshots(project_id, captured_at desc);
