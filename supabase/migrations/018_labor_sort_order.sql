-- Labor BOM-style hour lines: visual order
alter table public.labor_entries
  add column if not exists sort_order integer not null default 0;

create index if not exists labor_entries_project_sort_idx
  on public.labor_entries(project_id, sort_order);
