-- Mixinary ERP initial schema

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'estimator', 'tech');
create type public.order_status as enum ('none', 'ordered', 'shipped');
create type public.project_status as enum ('draft', 'active', 'on_hold', 'complete', 'archived');
create type public.ai_job_type as enum ('msrp_fetch', 'pdf_quote');
create type public.ai_job_status as enum ('queued', 'running', 'needs_review', 'applied', 'failed', 'rejected');

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'estimator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null unique,
  name text not null,
  client_id uuid references public.clients (id) on delete set null,
  status public.project_status not null default 'active',
  default_override_pct numeric(10, 6) not null default 0,
  notes text,
  created_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  section_id uuid references public.project_sections (id) on delete set null,
  sort_order int not null default 0,
  description text not null,
  sku text,
  qty numeric(12, 3) not null default 1,
  msrp numeric(14, 4) not null default 0,
  quote numeric(14, 4),
  override_pct numeric(10, 6),
  vendor_id uuid references public.vendors (id) on delete set null,
  order_status public.order_status not null default 'none',
  tracking text,
  carrier_id uuid references public.carriers (id) on delete set null,
  notes text,
  fetch_error text,
  msrp_source_url text,
  msrp_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_override_pct numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create table public.template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates (id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);

create table public.template_line_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates (id) on delete cascade,
  section_id uuid references public.template_sections (id) on delete set null,
  sort_order int not null default 0,
  description text not null,
  sku text,
  qty numeric(12, 3) not null default 1,
  msrp numeric(14, 4) not null default 0,
  quote numeric(14, 4),
  override_pct numeric(10, 6),
  vendor_code text,
  notes text
);

create table public.price_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_domain text not null unique,
  search_url_template text,
  enabled boolean not null default true,
  supports_search boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  type public.ai_job_type not null,
  status public.ai_job_status not null default 'queued',
  project_id uuid references public.projects (id) on delete cascade,
  created_by uuid references public.user_profiles (id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.price_fetch_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs (id) on delete cascade,
  line_item_id uuid references public.line_items (id) on delete cascade,
  price_source_id uuid references public.price_sources (id) on delete set null,
  product_name text,
  sku text,
  msrp numeric(14, 4),
  currency text default 'USD',
  source_url text,
  confidence numeric(5, 4),
  accepted boolean,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.quote_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  job_id uuid references public.ai_jobs (id) on delete set null,
  file_path text not null,
  file_name text not null,
  vendor_hint text,
  status public.ai_job_status not null default 'queued',
  quote_number text,
  quote_date text,
  created_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.quote_extracted_lines (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.quote_uploads (id) on delete cascade,
  sort_order int not null default 0,
  sku text,
  description text,
  qty numeric(12, 3),
  unit_price numeric(14, 4),
  ext_price numeric(14, 4),
  vendor text,
  matched_line_item_id uuid references public.line_items (id) on delete set null,
  match_score numeric(5, 4),
  action text default 'update_quote',
  selected boolean not null default true,
  raw jsonb
);

create index line_items_project_idx on public.line_items (project_id);
create index line_items_status_idx on public.line_items (order_status);
create index ai_jobs_status_idx on public.ai_jobs (status);
create index projects_client_idx on public.projects (client_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'estimator')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles where id = auth.uid()
  );
$$;

alter table public.user_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.vendors enable row level security;
alter table public.carriers enable row level security;
alter table public.projects enable row level security;
alter table public.project_sections enable row level security;
alter table public.line_items enable row level security;
alter table public.project_templates enable row level security;
alter table public.template_sections enable row level security;
alter table public.template_line_items enable row level security;
alter table public.price_sources enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.price_fetch_results enable row level security;
alter table public.quote_uploads enable row level security;
alter table public.quote_extracted_lines enable row level security;

-- Profiles
create policy "profiles_select_own_or_admin" on public.user_profiles
  for select using (id = auth.uid() or public.current_user_role() = 'admin');
create policy "profiles_update_admin" on public.user_profiles
  for update using (public.current_user_role() = 'admin');

-- Shared read for staff
create policy "clients_select" on public.clients for select using (public.is_staff());
create policy "vendors_select" on public.vendors for select using (public.is_staff());
create policy "carriers_select" on public.carriers for select using (public.is_staff());
create policy "projects_select" on public.projects for select using (public.is_staff());
create policy "sections_select" on public.project_sections for select using (public.is_staff());
create policy "lines_select" on public.line_items for select using (public.is_staff());
create policy "templates_select" on public.project_templates for select using (public.is_staff());
create policy "template_sections_select" on public.template_sections for select using (public.is_staff());
create policy "template_lines_select" on public.template_line_items for select using (public.is_staff());
create policy "price_sources_select" on public.price_sources for select using (public.is_staff());
create policy "ai_jobs_select" on public.ai_jobs for select using (public.is_staff());
create policy "price_results_select" on public.price_fetch_results for select using (public.is_staff());
create policy "quote_uploads_select" on public.quote_uploads for select using (public.is_staff());
create policy "quote_lines_select" on public.quote_extracted_lines for select using (public.is_staff());

-- Write: admin + estimator for most entities
create policy "clients_write" on public.clients for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "vendors_write" on public.vendors for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "carriers_write" on public.carriers for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "projects_write" on public.projects for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "sections_write" on public.project_sections for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "templates_write" on public.project_templates for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "template_sections_write" on public.template_sections for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "template_lines_write" on public.template_line_items for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "price_sources_write" on public.price_sources for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "ai_jobs_insert" on public.ai_jobs for insert
  with check (public.current_user_role() in ('admin', 'estimator'));
create policy "ai_jobs_update" on public.ai_jobs for update
  using (public.current_user_role() in ('admin', 'estimator'));

create policy "price_results_write" on public.price_fetch_results for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "quote_uploads_write" on public.quote_uploads for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "quote_lines_write" on public.quote_extracted_lines for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

-- Line items: tech can update status/tracking/notes only via restricted policy;
-- full write for admin/estimator; tech update of non-pricing fields handled in app + policy allowing update
create policy "lines_write_estimator" on public.line_items for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "lines_update_tech" on public.line_items for update
  using (public.current_user_role() = 'tech')
  with check (public.current_user_role() = 'tech');

-- Storage bucket for quote PDFs (run in dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('quote-pdfs', 'quote-pdfs', false);

-- Seed price sources
insert into public.price_sources (name, base_domain, search_url_template, supports_search, notes) values
  ('B&H Photo', 'bhphotovideo.com', 'https://www.bhphotovideo.com/c/search?Ntt={query}', true, 'Public catalog MSRP/street pricing'),
  ('FS.com', 'fs.com', 'https://www.fs.com/search_result?keyword={query}', true, 'Fiber / networking'),
  ('Shure', 'shure.com', 'https://www.shure.com/en-US/search?q={query}', true, 'Manufacturer MSRP pages'),
  ('Blackmagic Design', 'blackmagicdesign.com', 'https://www.blackmagicdesign.com/search?q={query}', true, 'Manufacturer pricing'),
  ('Middle Atlantic', 'middleatlantic.com', 'https://www.middleatlantic.com/search?q={query}', true, 'Rack manufacturer'),
  ('Netgear', 'netgear.com', 'https://www.netgear.com/search/?q={query}', true, 'AV Line switches'),
  ('Full Compass', 'fullcompass.com', 'https://www.fullcompass.com/search/{query}', true, 'Pro AV catalog'),
  ('Sound Pro', 'soundpro.com', null, false, 'Dealer portal — use paste URL or PDF quote'),
  ('Tecnec', 'tecnec.com', null, false, 'Dealer portal — use paste URL or PDF quote'),
  ('Elite Core', 'elitecoreaudio.com', null, false, 'Dealer — use paste URL or PDF quote');

-- Seed common vendors
insert into public.vendors (code, name) values
  ('SP', 'Sound Pro'),
  ('Tecnec', 'Tecnec'),
  ('EC', 'Elite Core'),
  ('BH', 'B&H Photo'),
  ('FS', 'FS.com'),
  ('Apple', 'Apple'),
  ('AVL', 'AVL'),
  ('Sound Pro', 'Sound Pro');
