-- Phase 3: Change orders
create table if not exists public.project_change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  co_number text not null,
  title text not null,
  description text,
  status text not null default 'draft',
  revenue_delta numeric not null default 0,
  budget_material_delta numeric not null default 0,
  budget_labor_delta numeric not null default 0,
  budget_expense_delta numeric not null default 0,
  budget_subcontractor_delta numeric not null default 0,
  budget_overhead_delta numeric not null default 0,
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  effective_date text,
  customer_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, co_number)
);

create index if not exists project_change_orders_project_idx
  on public.project_change_orders(project_id);
create index if not exists project_change_orders_status_idx
  on public.project_change_orders(project_id, status);
