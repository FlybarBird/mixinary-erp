import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface DashboardAlert {
  key: string;
  label: string;
  count: number;
  href: string;
}

export interface ProjectDashboard {
  projectId: string;
  projectNumber: string;
  projectName: string;
  status: string;

  materialBudget: number | null;
  materialCommitted: number;
  materialActual: number;

  laborBudget: number | null;
  laborActual: number;
  laborPending: number;

  otherExpenses: number;

  openPoCount: number;
  openPoValue: number;

  bomNotOrderedCount: number;

  awaitingShipmentCount: number;
  delayedCount: number;
  upcomingDeliveries: number;

  alerts: DashboardAlert[];
}

const CANCELLED_PO_STATUSES = ["cancelled"] as const;
const CLOSED_PO_STATUSES = ["closed", "cancelled"] as const;

const AWAITING_ITEM_STATUSES = [
  "ordered",
  "confirmed",
  "preparing",
  "shipped",
  "in_transit",
  "out_for_delivery",
];

export async function buildProjectDashboard(
  supabase: Client,
  projectId: string,
): Promise<ProjectDashboard | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, project_number, name, status, material_budget, labor_budget")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const [
    { data: allPos },
    { data: laborEntries },
    { data: expenses },
    { data: lineItems },
  ] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, status, total")
      .eq("project_id", projectId),
    supabase
      .from("labor_entries")
      .select("total_cost, approval_status")
      .eq("project_id", projectId),
    supabase
      .from("project_expenses")
      .select("amount, tax")
      .eq("project_id", projectId),
    supabase
      .from("line_items")
      .select("id, qty, qty_ordered")
      .eq("project_id", projectId),
  ]);

  const pos = allPos ?? [];
  const poIds = pos.map((po) => po.id);

  let allPoItems: Array<{
    id: string;
    po_id: string;
    item_status: string;
    qty_received: number;
    unit_price: number;
    qty_ordered: number;
    expected_delivery_date: string | null;
  }> = [];

  if (poIds.length > 0) {
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("id, po_id, item_status, qty_received, unit_price, qty_ordered, expected_delivery_date")
      .in("po_id", poIds);
    allPoItems = items ?? [];
  }

  const poItems = allPoItems;

  const nonCancelledPos = pos.filter(
    (po) => !CANCELLED_PO_STATUSES.includes(po.status as "cancelled"),
  );
  const materialCommitted = nonCancelledPos.reduce(
    (s, po) => s + Number(po.total ?? 0),
    0,
  );

  const materialActual = poItems
    .filter((item) => Number(item.qty_received ?? 0) > 0)
    .reduce(
      (s, item) => s + Number(item.qty_received ?? 0) * Number(item.unit_price ?? 0),
      0,
    );

  const laborActual = (laborEntries ?? []).reduce(
    (s, e) => s + Number(e.total_cost ?? 0),
    0,
  );
  const laborPending = (laborEntries ?? [])
    .filter((e) => e.approval_status === "pending")
    .reduce((s, e) => s + Number(e.total_cost ?? 0), 0);

  const otherExpenses = (expenses ?? []).reduce(
    (s, e) => s + Number(e.amount ?? 0) + Number(e.tax ?? 0),
    0,
  );

  const openPos = pos.filter(
    (po) => !CLOSED_PO_STATUSES.includes(po.status as "closed" | "cancelled"),
  );
  const openPoCount = openPos.length;
  const openPoValue = openPos.reduce((s, po) => s + Number(po.total ?? 0), 0);

  const bomNotOrderedCount = (lineItems ?? []).filter(
    (li) => Number(li.qty_ordered ?? 0) < Number(li.qty ?? 0),
  ).length;

  const awaitingShipmentCount = poItems.filter((item) =>
    AWAITING_ITEM_STATUSES.includes(item.item_status),
  ).length;

  const delayedCount = poItems.filter(
    (item) => item.item_status === "delayed" || item.item_status === "backordered",
  ).length;

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysStr = sevenDaysFromNow.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const upcomingDeliveries = poItems.filter((item) => {
    if (!item.expected_delivery_date) return false;
    const d = item.expected_delivery_date.slice(0, 10);
    return (
      d >= todayStr &&
      d <= sevenDaysStr &&
      item.item_status !== "received" &&
      item.item_status !== "cancelled"
    );
  }).length;

  const base = `/projects/${projectId}`;
  const alerts: DashboardAlert[] = [];

  if (delayedCount > 0) {
    alerts.push({
      key: "delayed",
      label: "Delayed / Backordered Items",
      count: delayedCount,
      href: `${base}/tracking?filter=delayed`,
    });
  }
  if (bomNotOrderedCount > 0) {
    alerts.push({
      key: "not_ordered",
      label: "BOM Items Not Ordered",
      count: bomNotOrderedCount,
      href: `${base}/procurement`,
    });
  }
  if (upcomingDeliveries > 0) {
    alerts.push({
      key: "upcoming",
      label: "Deliveries in Next 7 Days",
      count: upcomingDeliveries,
      href: `${base}/tracking`,
    });
  }
  if (laborPending > 0) {
    const pendingCount = (laborEntries ?? []).filter(
      (e) => e.approval_status === "pending",
    ).length;
    alerts.push({
      key: "labor_pending",
      label: "Labor Entries Awaiting Approval",
      count: pendingCount,
      href: `${base}/labor`,
    });
  }

  return {
    projectId: project.id,
    projectNumber: project.project_number,
    projectName: project.name,
    status: project.status,
    materialBudget: project.material_budget != null ? Number(project.material_budget) : null,
    materialCommitted,
    materialActual,
    laborBudget: project.labor_budget != null ? Number(project.labor_budget) : null,
    laborActual,
    laborPending,
    otherExpenses,
    openPoCount,
    openPoValue,
    bomNotOrderedCount,
    awaitingShipmentCount,
    delayedCount,
    upcomingDeliveries,
    alerts,
  };
}
