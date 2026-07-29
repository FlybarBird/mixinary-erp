import { TrackingView } from "@/components/TrackingView";
import { canManageProcurement, canReceive, requireProfile } from "@/lib/auth";
import { redactPoItemMoney } from "@/lib/money-redaction";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseOrderItem } from "@/lib/types";

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const membership = await getProjectMembership(profile.id, profile.role, id);
  const canMoney = membership.canViewMoney;
  const supabase = await createClient();

  // Load all POs for this project with vendor info
  const { data: orders } = await supabase
    .from("purchase_orders")
    .select("id, po_number, vendor_id, vendors(code, name)")
    .eq("project_id", id);

  const poIds = (orders ?? []).map((o) => o.id);
  let enrichedItems: Array<
    PurchaseOrderItem & {
      po_number: string;
      vendor_code: string;
      vendor_name: string;
      vendor_id: string;
      po_id: string;
    }
  > = [];

  if (poIds.length > 0) {
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("*")
      .in("po_id", poIds);

    const poMap = new Map(
      (orders ?? []).map((o) => [
        o.id,
        {
          po_number: o.po_number ?? "",
          vendor_id: o.vendor_id ?? "",
          vendor_code: (o.vendors as { code?: string; name?: string } | null)?.code ?? "",
          vendor_name: (o.vendors as { code?: string; name?: string } | null)?.name ?? "",
        },
      ]),
    );

    enrichedItems = (items ?? []).map((item) => {
      const po = poMap.get(item.po_id) ?? {
        po_number: "",
        vendor_id: "",
        vendor_code: "",
        vendor_name: "",
      };
      return {
        ...(item as PurchaseOrderItem),
        po_number: po.po_number,
        vendor_id: po.vendor_id,
        vendor_code: po.vendor_code,
        vendor_name: po.vendor_name,
        po_id: item.po_id,
      };
    });
  }

  const safeItems = canMoney
    ? enrichedItems
    : enrichedItems.map((item) => redactPoItemMoney(item));

  return (
    <TrackingView
      projectId={id}
      items={safeItems}
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
    />
  );
}
