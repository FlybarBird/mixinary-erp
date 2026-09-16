-- Rename Huly-era PM link column to vendor-neutral pm_project_id (OpenProject).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_pm_project_links'
      and column_name = 'huly_project_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_pm_project_links'
      and column_name = 'pm_project_id'
  ) then
    alter table public.erp_pm_project_links
      rename column huly_project_id to pm_project_id;
  end if;
end $$;
