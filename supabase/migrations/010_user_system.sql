-- Full user system: active flag, audit, invites, project members, RLS fixes

alter table public.user_profiles
  add column if not exists active boolean not null default true;

create table if not exists public.user_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.user_profiles (id) on delete set null,
  target_user_id uuid references public.user_profiles (id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_audit_events_created_idx
  on public.user_audit_events (created_at desc);

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role public.user_role not null default 'project_manager',
  token text not null unique,
  invited_by uuid references public.user_profiles (id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  access_role text not null default 'viewer'
    check (access_role in ('viewer', 'editor', 'manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_members_project_idx on public.project_members (project_id);
create index if not exists project_members_user_idx on public.project_members (user_id);

-- Fix signup trigger for expanded roles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_role public.user_role;
begin
  begin
    desired_role := coalesce(
      (new.raw_user_meta_data->>'role')::public.user_role,
      'project_manager'::public.user_role
    );
  exception when others then
    desired_role := 'project_manager'::public.user_role;
  end;

  insert into public.user_profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    desired_role,
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
    updated_at = now();
  return new;
end;
$$;

-- Helper: project access
create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() = 'administrator'
    or exists (
      select 1 from public.project_members m
      where m.project_id = p_project_id and m.user_id = auth.uid()
    );
$$;

-- Profiles RLS
drop policy if exists "profiles_select_own_or_admin" on public.user_profiles;
drop policy if exists "profiles_update_admin" on public.user_profiles;

create policy "profiles_select_own_or_admin" on public.user_profiles
  for select using (
    id = auth.uid()
    or public.current_user_role() = 'administrator'
    or public.is_staff()
  );
create policy "profiles_update_admin" on public.user_profiles
  for update using (public.current_user_role() = 'administrator');
create policy "profiles_update_own_name" on public.user_profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Fix legacy catalog policies
drop policy if exists "catalog_parts_select" on public.catalog_parts;
drop policy if exists "catalog_parts_write" on public.catalog_parts;
drop policy if exists "part_categories_write" on public.part_categories;
drop policy if exists "part_companies_write" on public.part_companies;

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'catalog_parts') then
    execute $p$
      create policy "catalog_parts_select" on public.catalog_parts
        for select using (public.is_staff());
      create policy "catalog_parts_write" on public.catalog_parts
        for all using (
          public.current_user_role() in ('administrator', 'project_manager')
        )
        with check (
          public.current_user_role() in ('administrator', 'project_manager')
        );
    $p$;
  end if;
exception when undefined_table then null;
end $$;

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'part_categories') then
    execute $p$
      create policy "part_categories_write" on public.part_categories
        for all using (
          public.current_user_role() in ('administrator', 'project_manager')
        )
        with check (
          public.current_user_role() in ('administrator', 'project_manager')
        );
    $p$;
  end if;
exception when undefined_table then null;
end $$;

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'part_companies') then
    execute $p$
      create policy "part_companies_write" on public.part_companies
        for all using (
          public.current_user_role() in ('administrator', 'project_manager')
        )
        with check (
          public.current_user_role() in ('administrator', 'project_manager')
        );
    $p$;
  end if;
exception when undefined_table then null;
end $$;

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'catalog_part_proposals') then
    execute $p$
      drop policy if exists "catalog_part_proposals_write" on public.catalog_part_proposals;
      create policy "catalog_part_proposals_write" on public.catalog_part_proposals
        for all using (
          public.current_user_role() in ('administrator', 'project_manager')
        )
        with check (
          public.current_user_role() in ('administrator', 'project_manager')
        );
    $p$;
  end if;
exception when undefined_table then null;
end $$;

-- Projects: member or admin
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (public.can_access_project(id));

alter table public.project_members enable row level security;
alter table public.user_audit_events enable row level security;
alter table public.user_invites enable row level security;

create policy "project_members_select" on public.project_members
  for select using (
    public.current_user_role() = 'administrator'
    or user_id = auth.uid()
    or public.can_access_project(project_id)
  );
create policy "project_members_write" on public.project_members
  for all using (
    public.current_user_role() = 'administrator'
    or exists (
      select 1 from public.project_members m
      where m.project_id = project_members.project_id
        and m.user_id = auth.uid()
        and m.access_role = 'manager'
    )
  )
  with check (
    public.current_user_role() = 'administrator'
    or exists (
      select 1 from public.project_members m
      where m.project_id = project_members.project_id
        and m.user_id = auth.uid()
        and m.access_role = 'manager'
    )
  );

create policy "user_audit_admin_select" on public.user_audit_events
  for select using (public.current_user_role() = 'administrator');

create policy "user_invites_admin" on public.user_invites
  for all using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');

-- Backfill: project creators become managers when no members exist
insert into public.project_members (project_id, user_id, access_role)
select p.id, p.created_by, 'manager'
from public.projects p
where p.created_by is not null
  and not exists (
    select 1 from public.project_members m where m.project_id = p.id
  )
on conflict (project_id, user_id) do nothing;
