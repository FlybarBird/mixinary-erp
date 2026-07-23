-- Add dealer/supplier account numbers on vendors
alter table public.vendors
  add column if not exists account_number text;
