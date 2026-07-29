-- Permission policy: per-user Create Projects override and
-- per-project-member View Money override (inherit / allow / deny).

alter table user_profiles
  add column if not exists create_projects_override text not null default 'inherit';

alter table user_profiles
  add constraint user_profiles_create_projects_override_check
  check (create_projects_override in ('inherit', 'allow', 'deny'));

alter table project_members
  add column if not exists view_money text not null default 'inherit';

alter table project_members
  add constraint project_members_view_money_check
  check (view_money in ('inherit', 'allow', 'deny'));
