-- Drop Plane-era suite integration objects if they were applied via 023.
-- Safe on fresh databases that never ran 023.

drop table if exists public.erp_plane_project_links cascade;
drop table if exists public.integration_outbox cascade;

drop index if exists public.user_profiles_idp_subject_uidx;

alter table public.user_profiles
  drop column if exists idp_subject;

alter table public.user_profiles
  drop column if exists pm_access;
