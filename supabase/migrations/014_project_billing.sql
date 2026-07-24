-- Phase 4: Invoices, payments, AR
create table if not exists public.project_invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invoice_number text not null,
  status text not null default 'draft',
  invoice_date text not null,
  due_date text,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  notes text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, invoice_number)
);

create table if not exists public.project_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.project_invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  change_order_id uuid references public.project_change_orders(id) on delete set null,
  category text,
  sort_order integer not null default 0
);

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  payment_date text not null,
  amount numeric not null default 0,
  method text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.project_payment_applications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.project_payments(id) on delete cascade,
  invoice_id uuid not null references public.project_invoices(id) on delete cascade,
  amount numeric not null default 0,
  unique (payment_id, invoice_id)
);

create index if not exists project_invoices_project_idx on public.project_invoices(project_id);
create index if not exists project_invoice_lines_invoice_idx on public.project_invoice_lines(invoice_id);
create index if not exists project_payments_project_idx on public.project_payments(project_id);
create index if not exists project_payment_applications_payment_idx on public.project_payment_applications(payment_id);
create index if not exists project_payment_applications_invoice_idx on public.project_payment_applications(invoice_id);
