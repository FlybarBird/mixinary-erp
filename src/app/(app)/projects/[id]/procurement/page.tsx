import { ProcurementView } from "@/components/ProcurementView";
import { canManageProcurement, canReceive, requireProfile } from "@/lib/auth";
import { getPoOrderEmailCc } from "@/lib/email";
import {
  redactPoItemMoney,
  redactPurchaseOrderMoney,
} from "@/lib/money-redaction";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseOrder, PurchaseOrderItem, Vendor } from "@/lib/types";

export default async function ProcurementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const membership = await getProjectMembership(profile.id, profile.role, id);
  const canMoney = membership.canViewMoney;
  const supabase = await createClient();

  const [{ data: project }, { data: orders }, { data: vendors }, { data: lines }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, default_override_pct")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("purchase_orders")
        .select("*, vendors(id, code, name, contact_name, contact_email)")
        .eq("project_id", id)
        .order("po_number"),
      supabase.from("vendors").select("*").order("code"),
      supabase
        .from("line_items")
        .select(
          "id, description, vendor_id, procurement_status, qty, qty_ordered, qty_received, msrp, quote, override_pct, estimated_unit_cost",
        )
        .eq("project_id", id),
    ]);

  const poIds = (orders ?? []).map((o) => o.id);
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

  const ordersWithItems = (orders ?? []).map((o) => {
    const base = o as PurchaseOrder & {
      vendors?: {
        id: string;
        code: string;
        name: string;
        contact_name?: string | null;
        contact_email?: string | null;
      } | null;
    };
    const items = (itemsByPo.get(o.id) ?? []).map((item) =>
      canMoney ? item : redactPoItemMoney(item),
    );
    return {
      ...(canMoney ? base : redactPurchaseOrderMoney(base)),
      items,
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
        msrp: canMoney ? Number(l.msrp || 0) : 0,
        quote: !canMoney || l.quote == null ? null : Number(l.quote),
        override_pct:
          !canMoney || l.override_pct == null ? null : Number(l.override_pct),
        estimated_unit_cost:
          !canMoney || l.estimated_unit_cost == null
            ? null
            : Number(l.estimated_unit_cost),
      }))}
      canEdit={canEditProjectContent(
        profile.role,
        membership.access,
        canManageProcurement(profile.role),
      )}
      canReceive={canEditProjectContent(
        profile.role,
        membership.access,
        canReceive(profile.role),
      )}
      canViewMoney={canMoney}
      signerName={profile.full_name || profile.email}
      poOrderCc={getPoOrderEmailCc() || null}
    />
  );
}
