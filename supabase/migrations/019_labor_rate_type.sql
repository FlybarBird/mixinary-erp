-- Hourly vs flat-rate billing/cost on labor lines
alter table public.labor_entries
  add column if not exists rate_type text not null default 'hourly';

alter table public.labor_entries
  drop constraint if exists labor_entries_rate_type_check;

alter table public.labor_entries
  add constraint labor_entries_rate_type_check
  check (rate_type in ('hourly', 'flat'));
