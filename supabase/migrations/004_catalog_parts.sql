-- Parts catalog: categories, manufacturers, catalog items

create table if not exists public.part_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.part_categories (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.part_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text,
  logo_path text,
  notes text,
  icecat_vendor_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_parts (
  id uuid primary key default gen_random_uuid(),
  sku text,
  upc text,
  name text not null,
  description text,
  category_id uuid references public.part_categories (id) on delete set null,
  company_id uuid references public.part_companies (id) on delete set null,
  default_vendor_id uuid references public.vendors (id) on delete set null,
  msrp numeric(14, 4) not null default 0,
  default_quote numeric(14, 4),
  image_path text,
  image_url text,
  specs jsonb,
  source text not null default 'manual',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.line_items
  add column if not exists catalog_part_id uuid references public.catalog_parts (id) on delete set null;

create index if not exists catalog_parts_sku_idx on public.catalog_parts (sku);
create index if not exists catalog_parts_name_idx on public.catalog_parts (name);
create index if not exists catalog_parts_category_idx on public.catalog_parts (category_id);
create index if not exists catalog_parts_company_idx on public.catalog_parts (company_id);

alter table public.part_categories enable row level security;
alter table public.part_companies enable row level security;
alter table public.catalog_parts enable row level security;

create policy "part_categories_select" on public.part_categories
  for select using (public.is_staff());
create policy "part_companies_select" on public.part_companies
  for select using (public.is_staff());
create policy "catalog_parts_select" on public.catalog_parts
  for select using (public.is_staff());

create policy "part_categories_write" on public.part_categories for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "part_companies_write" on public.part_companies for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

create policy "catalog_parts_write" on public.catalog_parts for all
  using (public.current_user_role() in ('admin', 'estimator'))
  with check (public.current_user_role() in ('admin', 'estimator'));

insert into storage.buckets (id, name, public)
values ('part-images', 'part-images', true)
on conflict (id) do nothing;

create policy "part_images_select"
on storage.objects for select
using (bucket_id = 'part-images');

create policy "part_images_insert_staff"
on storage.objects for insert
with check (
  bucket_id = 'part-images'
  and exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role in ('admin', 'estimator')
  )
);

-- Seed categories (skip if already seeded)
insert into public.part_categories (name, sort_order)
select v.name, v.sort_order
from (values
  ('Audio', 0),
  ('Video', 1),
  ('Networking', 2),
  ('Racks/Materials', 3),
  ('Cables', 4),
  ('Power', 5)
) as v(name, sort_order)
where not exists (select 1 from public.part_categories limit 1);

-- Seed manufacturers
insert into public.part_companies (name, website, icecat_vendor_name) values
  ('Shure', 'https://www.shure.com', 'Shure'),
  ('Blackmagic Design', 'https://www.blackmagicdesign.com', 'Blackmagic'),
  ('Middle Atlantic', 'https://www.middleatlantic.com', 'Middle Atlantic'),
  ('Netgear', 'https://www.netgear.com', 'NETGEAR'),
  ('Audinate', 'https://www.audinate.com', 'Audinate'),
  ('Apple', 'https://www.apple.com', 'Apple'),
  ('FS', 'https://www.fs.com', 'FS'),
  ('Elite Core', 'https://www.elitecoreaudio.com', null),
  ('Radial', 'https://www.radialeng.com', 'Radial'),
  ('Juice Goose', 'https://www.juicegoose.com', null)
on conflict (name) do nothing;
