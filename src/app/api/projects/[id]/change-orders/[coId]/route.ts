import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canApproveChangeOrders,
  canEditChangeOrders,
  canViewFinancials,
} from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import { captureProjectFinancialSnapshot } from "@/lib/projects/snapshots";
import type { ChangeOrderStatus } from "@/lib/types";

const STATUSES: ChangeOrderStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "void",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; coId: string }> },
) {
  const { id: projectId, coId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!canViewFinancials(profile.role) || !ctx.canViewMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ctx.canEdit(canEditChangeOrders)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("project_change_orders")
    .select("*")
    .eq("id", coId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const key of [
    "title",
    "description",
    "effective_date",
    "customer_reference",
  ] as const) {
    if (key in body) {
      patch[key] = body[key] ? String(body[key]) : null;
    }
  }
  if ("title" in body && !String(body.title || "").trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if ("title" in body) patch.title = String(body.title).trim();

  for (const key of [
    "revenue_delta",
    "budget_material_delta",
    "budget_labor_delta",
    "budget_expense_delta",
    "budget_subcontractor_delta",
    "budget_overhead_delta",
  ] as const) {
    if (key in body) patch[key] = Number(body[key] ?? 0) || 0;
  }

  let becomingApproved = false;
  if ("status" in body) {
    const status = String(body.status) as ChangeOrderStatus;
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (
      (status === "approved" || status === "rejected") &&
      !ctx.canEdit(canApproveChangeOrders)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status === "approved" && status !== "void" && status !== "approved") {
      if (!ctx.canEdit(canApproveChangeOrders)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    patch.status = status;
    if (status === "approved" && existing.status !== "approved") {
      becomingApproved = true;
      patch.approved_by = profile.id;
      patch.approved_at = new Date().toISOString();
    }
    if (status === "void" || status === "rejected" || status === "draft") {
      if (existing.status === "approved") {
        patch.approved_by = null;
        patch.approved_at = null;
      }
    }
  }

  // Lock field edits on approved unless voiding/admin
  if (
    existing.status === "approved" &&
    !("status" in body) &&
    !ctx.canEdit(canApproveChangeOrders)
  ) {
    return NextResponse.json(
      { error: "Approved change orders are locked" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("project_change_orders")
    .update(patch)
    .eq("id", coId)
    .eq("project_id", projectId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (becomingApproved || String(patch.status) === "void") {
    try {
      await captureProjectFinancialSnapshot(
        supabase,
        projectId,
        becomingApproved ? "co_approved" : "manual",
      );
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ changeOrder: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; coId: string }> },
) {
  const { id: projectId, coId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canEdit(canApproveChangeOrders)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("project_change_orders")
    .select("status")
    .eq("id", coId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "approved") {
    return NextResponse.json(
      { error: "Void approved change orders instead of deleting" },
      { status: 400 },
    );
  }
  const { error } = await supabase
    .from("project_change_orders")
    .delete()
    .eq("id", coId)
    .eq("project_id", projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
