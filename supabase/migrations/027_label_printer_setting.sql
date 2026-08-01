-- Company-wide warehouse label printer brand (DYMO vs Brother).

alter table public.company_settings
  add column if not exists label_printer text not null default 'dymo';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_settings_label_printer_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_label_printer_check
      check (label_printer in ('dymo', 'brother'));
  end if;
end $$;
