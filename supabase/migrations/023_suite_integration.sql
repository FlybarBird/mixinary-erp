-- Suite identity + Plane integration outbox (ERP side).
-- Mapping system of record for recovery also lives in the integration service DB.

alter table public.user_profiles
  add column if not exists idp_subject text;

alter table public.user_profiles
  add column if not exists pm_access boolean not null default false;

create unique index if not exists user_profiles_idp_subject_uidx
  on public.user_profiles (idp_subject)
  where idp_subject is not null;

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists integration_outbox_status_idx
  on public.integration_outbox (status, created_at);

create table if not exists public.erp_plane_project_links (
  id uuid primary key default gen_random_uuid(),
  erp_project_id uuid not null references public.projects(id) on delete cascade,
  plane_project_id text,
  integration_status text not null default 'pending',
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (erp_project_id)
);

alter table public.integration_outbox enable row level security;
alter table public.erp_plane_project_links enable row level security;
