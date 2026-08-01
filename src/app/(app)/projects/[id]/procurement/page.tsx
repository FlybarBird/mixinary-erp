import { ProcurementView } from "@/components/ProcurementView";
import { canManageProcurement, canReceive, requireProfile } from "@/lib/auth";
import { getPoOrderEmailCc } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { listAccessiblePoIds } from "@/lib/projects/po-move";
import type { PurchaseOrder, PurchaseOrderItem, Vendor } from "@/lib/types";

export default async function ProcurementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const poIds = await listAccessiblePoIds(supabase, id);

  const [{ data: project }, { data: orders }, { data: vendors }, { data: lines }, { data: links }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, default_override_pct")
        .eq("id", id)
        .maybeSingle(),
      poIds.length
        ? supabase
            .from("purchase_orders")
            .select("*, vendors(id, code, name, contact_name, contact_email)")
            .in("id", poIds)
            .order("po_number")
        : Promise.resolve({ data: [] as PurchaseOrder[] }),
      supabase.from("vendors").select("*").order("code"),
      supabase
        .from("line_items")
        .select(
          "id, description, vendor_id, procurement_status, qty, qty_ordered, qty_received, msrp, quote, override_pct, estimated_unit_cost",
        )
        .eq("project_id", id),
      poIds.length
        ? supabase
            .from("purchase_order_project_links")
            .select("po_id, project_id, is_owner")
            .in("po_id", poIds)
        : Promise.resolve({ data: [] as Array<{ po_id: string; project_id: string; is_owner: boolean }> }),
    ]);

  let allItems: PurchaseOrderItem[] = [];
  if (poIds.length > 0) {
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("*")
      .in("po_id", poIds);
    allItems = (items ?? []) as PurchaseOrderItem[];
  }

  const itemsByPo = new Map<string, PurchaseOrderItem[]>();
  for (const item of allItems) {
    if (!itemsByPo.has(item.po_id)) itemsByPo.set(item.po_id, []);
    itemsByPo.get(item.po_id)!.push(item);
  }

  const linksByPo = new Map<string, Array<{ project_id: string; is_owner: boolean }>>();
  for (const link of links ?? []) {
    if (!linksByPo.has(link.po_id)) linksByPo.set(link.po_id, []);
    linksByPo.get(link.po_id)!.push({
      project_id: link.project_id,
      is_owner: Boolean(link.is_owner),
    });
  }

  const ordersWithItems = (orders ?? []).map((o) => {
    const po = o as PurchaseOrder & {
      vendors?: {
        id: string;
        code: string;
        name: string;
        contact_name?: string | null;
        contact_email?: string | null;
      } | null;
    };
    const poLinks = linksByPo.get(po.id) ?? [];
    const isOwner = po.project_id === id;
    return {
      ...po,
      items: itemsByPo.get(po.id) ?? [],
      is_owner: isOwner,
      is_shared:
        !isOwner ||
        poLinks.some((l) => !l.is_owner && l.project_id !== po.project_id),
      linked_project_ids: poLinks.map((l) => l.project_id),
    };
  });

  return (
    <ProcurementView
      projectId={id}
      defaultOverridePct={Number(project?.default_override_pct || 0)}
      vendors={(vendors ?? []) as Vendor[]}
      initialOrders={ordersWithItems}
      bomLines={(lines ?? []).map((l) => ({
        id: l.id,
        description: l.description,
        vendor_id: l.vendor_id,
        procurement_status: String(l.procurement_status || "not_ordered"),
        qty: Number(l.qty || 0),
        qty_ordered: Number(l.qty_ordered || 0),
        qty_received: Number(l.qty_received || 0),
        msrp: Number(l.msrp || 0),
        quote: l.quote == null ? null : Number(l.quote),
        override_pct: l.override_pct == null ? null : Number(l.override_pct),
        estimated_unit_cost:
          l.estimated_unit_cost == null ? null : Number(l.estimated_unit_cost),
      }))}
      canEdit={canManageProcurement(profile.role)}
      canReceive={canReceive(profile.role)}
      signerName={profile.full_name}
      poOrderCc={await getPoOrderEmailCc()}
    />
  );
}
