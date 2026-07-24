-- Project financial foundation: contract revenue, budgets, cost ledger
alter table public.projects
  add column if not exists expense_budget numeric;
alter table public.projects
  add column if not exists subcontractor_budget numeric;
alter table public.projects
  add column if not exists overhead_budget numeric;
alter table public.projects
  add column if not exists original_revenue numeric;
alter table public.projects
  add column if not exists revenue_additions numeric not null default 0;
alter table public.projects
  add column if not exists revenue_credits numeric not null default 0;
alter table public.projects
  add column if not exists start_date text;
alter table public.projects
  add column if not exists target_completion_date text;
alter table public.projects
  add column if not exists percent_complete numeric not null default 0;
alter table public.projects
  add column if not exists financials_updated_at timestamptz;

alter table public.project_expenses
  add column if not exists po_id uuid references public.purchase_orders(id) on delete set null;

create table if not exists public.project_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null,
  source_type text not null,
  source_id text not null,
  vendor_or_person text,
  description text,
  budget_amount numeric not null default 0,
  committed_amount numeric not null default 0,
  actual_amount numeric not null default 0,
  forecast_amount numeric not null default 0,
  transaction_date text,
  approval_status text,
  payment_status text,
  billable boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, category)
);

create index if not exists project_cost_ledger_project_idx
  on public.project_cost_ledger(project_id);
create index if not exists project_cost_ledger_category_idx
  on public.project_cost_ledger(project_id, category);
