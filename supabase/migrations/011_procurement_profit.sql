-- Procurement profit / margin persistence
alter table public.purchase_order_items
  add column if not exists sale_total numeric not null default 0;
alter table public.purchase_order_items
  add column if not exists allocated_shipping numeric not null default 0;
alter table public.purchase_order_items
  add column if not exists allocated_tax numeric not null default 0;
alter table public.purchase_order_items
  add column if not exists cost_total numeric not null default 0;
alter table public.purchase_order_items
  add column if not exists profit numeric not null default 0;
alter table public.purchase_order_items
  add column if not exists margin_pct numeric;

alter table public.purchase_orders
  add column if not exists sale_total numeric not null default 0;
alter table public.purchase_orders
  add column if not exists profit numeric not null default 0;
alter table public.purchase_orders
  add column if not exists margin_pct numeric;
