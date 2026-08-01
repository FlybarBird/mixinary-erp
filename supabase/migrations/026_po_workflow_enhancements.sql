-- Shared POs across projects + helpers for move/split/renumber workflows.

create table if not exists public.purchase_order_project_links (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (po_id, project_id)
);

create index if not exists purchase_order_project_links_project_idx
  on public.purchase_order_project_links (project_id);

create index if not exists purchase_order_project_links_po_idx
  on public.purchase_order_project_links (po_id);

-- Backfill owner links from existing POs
insert into public.purchase_order_project_links (po_id, project_id, is_owner)
select id, project_id, true
from public.purchase_orders
on conflict (po_id, project_id) do nothing;

alter table public.purchase_order_project_links enable row level security;

create policy "po_project_links_select" on public.purchase_order_project_links
  for select using (public.is_staff());

create policy "po_project_links_write" on public.purchase_order_project_links
  for all
  using (public.current_user_role() in ('administrator', 'project_manager', 'purchasing'))
  with check (public.current_user_role() in ('administrator', 'project_manager', 'purchasing'));
