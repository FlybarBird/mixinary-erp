import type { PoItemStatus, PoStatus, ProcurementStatus } from "@/lib/types";

export function suggestPoStatus(
  items: Array<{ item_status: string; qty_ordered: number; qty_shipped: number; qty_received: number }>,
): { status: PoStatus; warning?: string } {
  const active = items.filter((i) => i.item_status !== "cancelled");
  if (!items.length) return { status: "draft" };
  if (!active.length) return { status: "cancelled" };

  const allReceived = active.every(
    (i) =>
      i.item_status === "received" ||
      (i.qty_ordered > 0 && i.qty_received >= i.qty_ordered),
  );
  if (allReceived) return { status: "received" };

  const anyReceived = active.some(
    (i) => i.qty_received > 0 || i.item_status === "partially_received" || i.item_status === "received",
  );
  const allShipped = active.every(
    (i) =>
      i.item_status === "shipped" ||
      i.item_status === "in_transit" ||
      i.item_status === "out_for_delivery" ||
      i.item_status === "received" ||
      i.item_status === "partially_received" ||
      (i.qty_shipped >= i.qty_ordered && i.qty_ordered > 0),
  );
  const anyShipped = active.some(
    (i) =>
      i.qty_shipped > 0 ||
      ["shipped", "in_transit", "out_for_delivery", "partially_received", "received"].includes(
        i.item_status,
      ),
  );

  if (anyReceived && !allReceived) return { status: "partially_received" };
  if (allShipped && !anyReceived) return { status: "shipped" };
  if (anyShipped && !anyReceived) return { status: "partially_shipped" };

  const delayed = active.some(
    (i) => i.item_status === "delayed" || i.item_status === "backordered",
  );
  if (delayed) {
    return {
      status: "ordered",
      warning: "Mixed delayed or backordered items",
    };
  }

  const allOrdered = active.every((i) => i.item_status !== "not_ordered");
  if (allOrdered) return { status: "ordered" };
  return { status: "draft" };
}

export function deriveBomProcurementStatus(params: {
  qty: number;
  qtyOrdered: number;
  qtyReceived: number;
}): ProcurementStatus {
  const { qty, qtyOrdered, qtyReceived } = params;
  if (qtyReceived >= qty && qty > 0) return "received";
  if (qtyReceived > 0) return "partially_received";
  if (qtyOrdered >= qty && qty > 0) return "ordered";
  if (qtyOrdered > 0) return "partially_ordered";
  return "not_ordered";
}

export const PO_STATUSES: PoStatus[] = [
  "draft",
  "ready_to_order",
  "ordered",
  "confirmed",
  "partially_shipped",
  "shipped",
  "partially_received",
  "received",
  "on_hold",
  "closed",
  "cancelled",
];

export const PO_ITEM_STATUSES: PoItemStatus[] = [
  "not_ordered",
  "ordered",
  "confirmed",
  "preparing",
  "backordered",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "partially_received",
  "received",
  "delayed",
  "cancelled",
];

export function formatStatusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
