-- Images uploaded onto client quotes (proposals and other client documents).
insert into storage.buckets (id, name, public)
values ('client-document-images', 'client-document-images', false)
on conflict (id) do nothing;

create policy "client_document_images_select_staff"
on storage.objects for select
using (
  bucket_id = 'client-document-images'
  and public.current_user_role() in ('administrator', 'project_manager', 'accounting')
);

create policy "client_document_images_insert_staff"
on storage.objects for insert
with check (
  bucket_id = 'client-document-images'
  and public.current_user_role() in ('administrator', 'project_manager', 'accounting')
);
