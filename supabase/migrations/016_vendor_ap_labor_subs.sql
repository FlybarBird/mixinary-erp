-- Phase 6: Vendor AP, labor burden, subcontracts
alter table public.projects
  add column if not exists labor_burden_enabled boolean not null default false;
alter table public.projects
  add column if not exists default_burden_pct numeric not null default 0;

alter table public.labor_entries
  add column if not exists burden_pct numeric not null default 0;
alter table public.labor_entries
  add column if not exists billing_rate numeric not null default 0;

create table if not exists public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_invoice_number text,
  bill_date text,
  due_date text,
  amount numeric not null default 0,
  amount_paid numeric not null default 0,
  status text not null default 'accrued',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_subcontracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  sub_name text,
  description text not null,
  contract_amount numeric not null default 0,
  status text not null default 'draft',
  billed_to_date numeric not null default 0,
  paid_to_date numeric not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_subcontract_bills (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references public.project_subcontracts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  bill_date text not null,
  description text,
  amount numeric not null default 0,
  amount_paid numeric not null default 0,
  status text not null default 'billed',
  created_at timestamptz not null default now()
);

create index if not exists vendor_bills_project_idx on public.vendor_bills(project_id);
create index if not exists vendor_bills_po_idx on public.vendor_bills(purchase_order_id);
create index if not exists project_subcontracts_project_idx on public.project_subcontracts(project_id);
create index if not exists project_subcontract_bills_sub_idx on public.project_subcontract_bills(subcontract_id);
