-- Per-item shipping on purchase order lines (landed cost)
alter table public.purchase_order_items
  add column if not exists shipping numeric(14, 4) not null default 0;
