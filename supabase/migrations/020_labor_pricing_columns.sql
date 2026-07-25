-- Labor BOM-style pricing columns (qty / msrp / quote / override)
alter table public.labor_entries
  add column if not exists qty numeric not null default 1;

alter table public.labor_entries
  add column if not exists msrp numeric not null default 0;

alter table public.labor_entries
  add column if not exists quote numeric;

alter table public.labor_entries
  add column if not exists override_pct numeric;

-- Seed msrp from legacy hourly_rate when still zero (flat amounts)
update public.labor_entries
set msrp = hourly_rate
where coalesce(msrp, 0) = 0
  and coalesce(hourly_rate, 0) > 0;
