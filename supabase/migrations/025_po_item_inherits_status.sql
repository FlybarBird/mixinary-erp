-- PO line items can inherit parent PO status, with per-item override.

alter table public.purchase_order_items
  add column if not exists inherits_po_status boolean not null default true;

comment on column public.purchase_order_items.inherits_po_status is
  'When true, item_status follows the parent PO status on PO status changes. Manual item status edits set this false.';
