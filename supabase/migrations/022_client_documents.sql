-- Client Documents add-on (Phase 1): company settings/branding + client-facing
-- proposal/quote documents with blocks, share tokens, events, signatures.

-- Singleton company settings / branding row (single-company install).
create table if not exists public.company_settings (
  id text primary key default 'default',
  client_documents_enabled boolean not null default false,
  legal_name text,
  address text,
  contact_email text,
  contact_phone text,
  tax_id text,
  logo_path text,
  brand_color_primary text not null default '#0070f2',
  brand_color_accent text not null default '#223548',
  default_terms text,
  default_payment_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  doc_type text not null default 'proposal_quote',
  name text not null,
  doc_number text not null,
  status text not null default 'draft',
  version integer not null default 1,
  parent_document_id uuid references public.client_documents(id) on delete set null,
  expires_at timestamptz,
  sent_at timestamptz,
  subtotal numeric not null default 0,
  discount_total numeric not null default 0,
  tax_total numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  assigned_to uuid references public.user_profiles(id) on delete set null,
  settings jsonb,
  created_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, doc_number)
);

create table if not exists public.client_document_blocks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.client_documents(id) on delete cascade,
  block_type text not null,
  sort_order integer not null default 0,
  hidden boolean not null default false,
  content jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_document_tokens (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.client_documents(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.client_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.client_documents(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid,
  ip text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.client_documents(id) on delete cascade,
  signer_name text not null,
  signer_email text,
  signature_text text not null,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index if not exists client_documents_project_idx on public.client_documents(project_id);
create index if not exists client_document_blocks_document_idx on public.client_document_blocks(document_id);
create index if not exists client_document_tokens_document_idx on public.client_document_tokens(document_id);
create index if not exists client_document_events_document_idx on public.client_document_events(document_id);
create index if not exists client_document_signatures_document_idx on public.client_document_signatures(document_id);

-- RLS: staff access via project membership; customer access goes through the
-- service role (public token routes), which bypasses RLS by design.
alter table public.company_settings enable row level security;
alter table public.client_documents enable row level security;
alter table public.client_document_blocks enable row level security;
alter table public.client_document_tokens enable row level security;
alter table public.client_document_events enable row level security;
alter table public.client_document_signatures enable row level security;

drop policy if exists "company_settings_select" on public.company_settings;
create policy "company_settings_select" on public.company_settings
  for select using (public.is_staff());
drop policy if exists "company_settings_write" on public.company_settings;
create policy "company_settings_write" on public.company_settings
  for all using (public.current_user_role() = 'administrator');

drop policy if exists "client_documents_all" on public.client_documents;
create policy "client_documents_all" on public.client_documents
  for all using (public.can_access_project(project_id));

drop policy if exists "client_document_blocks_all" on public.client_document_blocks;
create policy "client_document_blocks_all" on public.client_document_blocks
  for all using (
    exists (
      select 1 from public.client_documents d
      where d.id = document_id and public.can_access_project(d.project_id)
    )
  );

drop policy if exists "client_document_tokens_all" on public.client_document_tokens;
create policy "client_document_tokens_all" on public.client_document_tokens
  for all using (
    exists (
      select 1 from public.client_documents d
      where d.id = document_id and public.can_access_project(d.project_id)
    )
  );

drop policy if exists "client_document_events_all" on public.client_document_events;
create policy "client_document_events_all" on public.client_document_events
  for all using (
    exists (
      select 1 from public.client_documents d
      where d.id = document_id and public.can_access_project(d.project_id)
    )
  );

drop policy if exists "client_document_signatures_all" on public.client_document_signatures;
create policy "client_document_signatures_all" on public.client_document_signatures
  for all using (
    exists (
      select 1 from public.client_documents d
      where d.id = document_id and public.can_access_project(d.project_id)
    )
  );
