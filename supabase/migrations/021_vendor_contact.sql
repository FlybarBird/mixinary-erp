-- Vendor order-email contact
alter table vendors add column if not exists contact_name text;
alter table vendors add column if not exists contact_email text;
