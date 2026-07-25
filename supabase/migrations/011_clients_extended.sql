-- Extend clients with code, address, website, and active flag

alter table public.clients
  add column if not exists code text,
  add column if not exists website text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists active boolean not null default true;

create unique index if not exists clients_code_unique
  on public.clients (code)
  where code is not null and code <> '';
