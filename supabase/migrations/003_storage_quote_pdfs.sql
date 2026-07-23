insert into storage.buckets (id, name, public)
values ('quote-pdfs', 'quote-pdfs', false)
on conflict (id) do nothing;

create policy "quote_pdfs_select_staff"
on storage.objects for select
using (
  bucket_id = 'quote-pdfs'
  and exists (select 1 from public.user_profiles where id = auth.uid())
);

create policy "quote_pdfs_insert_estimators"
on storage.objects for insert
with check (
  bucket_id = 'quote-pdfs'
  and exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role in ('admin', 'estimator')
  )
);
