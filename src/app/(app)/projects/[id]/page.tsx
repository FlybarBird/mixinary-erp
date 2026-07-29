import { BomEditor } from "@/components/BomEditor";
import { canEditBom, requireProfile } from "@/lib/auth";
import {
  redactLineItemMoney,
  redactPoItemMoney,
  redactPurchaseOrderMoney,
} from "@/lib/money-redaction";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { LineItem, ProjectSection, Vendor } from "@/lib/types";

export default async function ProjectBomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const membership = await getProjectMembership(profile.id, profile.role, id);
  const canMoney = membership.canViewMoney;
  const supabase = await createClient();

  const [
    { data: project },
    { data: sections },
    { data: lines },
    { data: vendors },
    { data: purchaseOrders },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, default_override_pct")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("project_sections")
      .select("*")
      .eq("project_id", id)
      .order("sort_order"),
    supabase
      .from("line_items")
      .select("*, vendors(code, name)")
      .eq("project_id", id)
      .order("sort_order"),
    supabase.from("vendors").select("*").order("code"),
    supabase
      .from("purchase_orders")
      .select("id, status, shipping, tax")
      .eq("project_id", id),
  ]);

  if (!project) return null;

  const poIds = (purchaseOrders ?? []).map((po) => po.id);
  let poItems: Array<{
    po_id: string;
    line_item_id: string | null;
    qty_ordered: number;
    unit_price: number;
    line_total: number;
    item_status: string;
  }> = [];
  if (poIds.length) {
    const { data } = await supabase
      .from("purchase_order_items")
      .select(
        "po_id, line_item_id, qty_ordered, unit_price, line_total, item_status",
      )
      .in("po_id", poIds);
    poItems = (data ?? []) as typeof poItems;
  }

  const safeLines = (lines ?? []).map((l) =>
    canMoney ? l : redactLineItemMoney(l),
  ) as LineItem[];
  const safePos = (purchaseOrders ?? []).map((po) =>
    canMoney ? po : redactPurchaseOrderMoney(po),
  );
  const safePoItems = poItems.map((item) =>
    canMoney ? item : redactPoItemMoney(item),
  );

  return (
    <BomEditor
      projectId={project.id}
      defaultOverridePct={Number(project.default_override_pct)}
      initialSections={(sections ?? []) as ProjectSection[]}
      initialLines={safeLines}
      vendors={(vendors ?? []) as Vendor[]}
      purchaseOrders={safePos}
      poItems={safePoItems}
      canEditPricing={canEditProjectContent(
        profile.role,
        membership.access,
        canEditBom(profile.role),
      )}
      canViewMoney={canMoney}
    />
  );
}
