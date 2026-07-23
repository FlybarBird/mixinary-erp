-- Expand user roles and project workspace foundation
-- Migrate: admin→administrator, estimator→project_manager, tech→field

alter type public.user_role rename to user_role_old;

create type public.user_role as enum (
  'administrator',
  'project_manager',
  'purchasing',
  'warehouse',
  'accounting',
  'field',
  'read_only'
);

alter table public.user_profiles
  alter column role drop default;

alter table public.user_profiles
  alter column role type public.user_role
  using (
    case role::text
      when 'admin' then 'administrator'::public.user_role
      when 'estimator' then 'project_manager'::public.user_role
      when 'tech' then 'field'::public.user_role
      when 'administrator' then 'administrator'::public.user_role
      when 'project_manager' then 'project_manager'::public.user_role
      when 'purchasing' then 'purchasing'::public.user_role
      when 'warehouse' then 'warehouse'::public.user_role
      when 'accounting' then 'accounting'::public.user_role
      when 'field' then 'field'::public.user_role
      when 'read_only' then 'read_only'::public.user_role
      else 'read_only'::public.user_role
    end
  );

alter table public.user_profiles
  alter column role set default 'project_manager'::public.user_role;

drop type public.user_role_old;

-- Project manager + budgets
alter table public.projects
  add column if not exists project_manager_id uuid references public.user_profiles (id) on delete set null;

alter table public.projects
  add column if not exists material_budget numeric(14, 4);

alter table public.projects
  add column if not exists labor_budget numeric(14, 4);

-- BOM procurement fields
alter table public.line_items
  add column if not exists category text;

alter table public.line_items
  add column if not exists uom text default 'ea';

alter table public.line_items
  add column if not exists estimated_unit_cost numeric(14, 4);

alter table public.line_items
  add column if not exists required_by_date date;

alter table public.line_items
  add column if not exists procurement_status text default 'not_ordered';

alter table public.line_items
  add column if not exists qty_ordered numeric(12, 3) not null default 0;

alter table public.line_items
  add column if not exists qty_received numeric(12, 3) not null default 0;

-- Purchase orders
create type public.po_status as enum (
  'draft',
  'ready_to_order',
  'ordered',
  'confirmed',
  'partially_shipped',
  'shipped',
  'partially_received',
  'received',
  'on_hold',
  'closed',
  'cancelled'
);

create type public.po_item_status as enum (
  'not_ordered',
  'ordered',
  'confirmed',
  'preparing',
  'backordered',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'partially_received',
  'received',
  'delayed',
  'cancelled'
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id),
  po_number text not null,
  order_date date,
  ordered_by uuid references public.user_profiles (id) on delete set null,
  status public.po_status not null default 'draft',
  expected_delivery_date date,
  subtotal numeric(14, 4) not null default 0,
  tax numeric(14, 4) not null default 0,
  shipping numeric(14, 4) not null default 0,
  total numeric(14, 4) not null default 0,
  vendor_contact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, po_number)
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  line_item_id uuid references public.line_items (id) on delete set null,
  sku text,
  vendor_sku text,
  description text not null,
  qty_ordered numeric(12, 3) not null default 0,
  unit_price numeric(14, 4) not null default 0,
  line_total numeric(14, 4) not null default 0,
  expected_ship_date date,
  expected_delivery_date date,
  qty_shipped numeric(12, 3) not null default 0,
  qty_received numeric(12, 3) not null default 0,
  item_status public.po_item_status not null default 'not_ordered',
  carrier_id uuid references public.carriers (id) on delete set null,
  tracking_number text,
  tracking_url text,
  latest_tracking_update text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  po_item_id uuid not null references public.purchase_order_items (id) on delete cascade,
  event_at timestamptz not null default now(),
  status text not null,
  message text,
  created_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.labor_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  worker_name text not null,
  user_id uuid references public.user_profiles (id) on delete set null,
  work_category text,
  task_description text,
  work_date date not null,
  estimated_hours numeric(10, 2) not null default 0,
  actual_hours numeric(10, 2) not null default 0,
  regular_hours numeric(10, 2) not null default 0,
  overtime_hours numeric(10, 2) not null default 0,
  hourly_rate numeric(14, 4) not null default 0,
  total_cost numeric(14, 4) not null default 0,
  approval_status text not null default 'pending',
  notes text,
  created_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  expense_date date not null,
  category text not null default 'miscellaneous',
  payee text,
  description text not null,
  amount numeric(14, 4) not null default 0,
  tax numeric(14, 4) not null default 0,
  cost_code text,
  submitted_by uuid references public.user_profiles (id) on delete set null,
  approval_status text not null default 'pending',
  payment_status text not null default 'unpaid',
  is_additional_charge boolean not null default false,
  receipt_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  actor_id uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists purchase_orders_project_idx on public.purchase_orders (project_id);
create index if not exists purchase_order_items_po_idx on public.purchase_order_items (po_id);
create index if not exists purchase_order_items_line_idx on public.purchase_order_items (line_item_id);
create index if not exists labor_entries_project_idx on public.labor_entries (project_id);
create index if not exists project_expenses_project_idx on public.project_expenses (project_id);
create index if not exists attachments_project_idx on public.attachments (project_id);
create index if not exists audit_events_project_idx on public.audit_events (project_id);
create index if not exists app_notifications_user_idx on public.app_notifications (user_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.tracking_events enable row level security;
alter table public.labor_entries enable row level security;
alter table public.project_expenses enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_events enable row level security;
alter table public.app_notifications enable row level security;

create policy "po_select" on public.purchase_orders for select using (public.is_staff());
create policy "po_items_select" on public.purchase_order_items for select using (public.is_staff());
create policy "tracking_events_select" on public.tracking_events for select using (public.is_staff());
create policy "labor_select" on public.labor_entries for select using (public.is_staff());
create policy "expenses_select" on public.project_expenses for select using (public.is_staff());
create policy "attachments_select" on public.attachments for select using (public.is_staff());
create policy "audit_select" on public.audit_events for select using (public.is_staff());
create policy "notifications_select" on public.app_notifications for select
  using (user_id = auth.uid() or public.current_user_role() = 'administrator');

create policy "po_write" on public.purchase_orders for all
  using (public.current_user_role() in ('administrator', 'project_manager', 'purchasing'))
  with check (public.current_user_role() in ('administrator', 'project_manager', 'purchasing'));

create policy "po_items_write" on public.purchase_order_items for all
  using (public.current_user_role() in ('administrator', 'project_manager', 'purchasing', 'warehouse'))
  with check (public.current_user_role() in ('administrator', 'project_manager', 'purchasing', 'warehouse'));

create policy "tracking_events_write" on public.tracking_events for all
  using (public.current_user_role() in ('administrator', 'project_manager', 'purchasing', 'warehouse', 'field'))
  with check (public.current_user_role() in ('administrator', 'project_manager', 'purchasing', 'warehouse', 'field'));

create policy "labor_write" on public.labor_entries for all
  using (public.current_user_role() in ('administrator', 'project_manager', 'field'))
  with check (public.current_user_role() in ('administrator', 'project_manager', 'field'));

create policy "expenses_write" on public.project_expenses for all
  using (public.current_user_role() in ('administrator', 'project_manager', 'accounting', 'field'))
  with check (public.current_user_role() in ('administrator', 'project_manager', 'accounting', 'field'));

create policy "attachments_write" on public.attachments for all
  using (public.current_user_role() in ('administrator', 'project_manager', 'purchasing', 'accounting', 'warehouse', 'field'))
  with check (public.current_user_role() in ('administrator', 'project_manager', 'purchasing', 'accounting', 'warehouse', 'field'));

create policy "audit_write" on public.audit_events for insert
  with check (public.is_staff());

create policy "notifications_write" on public.app_notifications for all
  using (user_id = auth.uid() or public.current_user_role() = 'administrator')
  with check (user_id = auth.uid() or public.current_user_role() = 'administrator');
