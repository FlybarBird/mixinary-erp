-- Wave C/D: audit reason, expense billable/CO link, ledger CO association
alter table public.audit_events
  add column if not exists reason text;

alter table public.project_expenses
  add column if not exists is_billable boolean not null default false;
alter table public.project_expenses
  add column if not exists change_order_id uuid references public.project_change_orders(id) on delete set null;

alter table public.project_cost_ledger
  add column if not exists change_order_id uuid references public.project_change_orders(id) on delete set null;

create index if not exists project_expenses_change_order_idx
  on public.project_expenses(change_order_id);
create index if not exists project_cost_ledger_change_order_idx
  on public.project_cost_ledger(change_order_id);
