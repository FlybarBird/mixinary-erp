-- Add Sweetwater as an allowlisted MSRP / catalog price source.
insert into public.price_sources (name, base_domain, search_url_template, supports_search, notes)
select
  'Sweetwater',
  'sweetwater.com',
  'https://www.sweetwater.com/store/search?s={query}',
  true,
  'Pro audio catalog (search + product pages)'
where not exists (
  select 1 from public.price_sources where base_domain = 'sweetwater.com'
);
