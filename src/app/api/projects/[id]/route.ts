import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canEditBom, canViewFinancials } from "@/lib/auth";
import {
  canAccessProject,
  canEditProjectContent,
  getProjectAccessRole,
} from "@/lib/project-access";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import type { ProjectStatus } from "@/lib/types";

const STATUSES: ProjectStatus[] = [
  "draft",
  "active",
  "on_hold",
  "complete",
  "archived",
];

async function requireProjectEditor(projectId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const access = await getProjectAccessRole(profile.id, profile.role, projectId);
  if (!canEditProjectContent(profile.role, access, canEditBom(profile.role))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { profile };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireProjectEditor(id);
  if ("error" in gate && gate.error) return gate.error;

  const body = await request.json();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("project_number" in body) {
    const projectNumber = String(body.project_number ?? "").trim();
    if (!projectNumber) {
      return NextResponse.json(
        { error: "Project number is required" },
        { status: 400 },
      );
    }
    patch.project_number = projectNumber;
  }

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 },
      );
    }
    patch.name = name;
  }

  if ("client_id" in body) {
    patch.client_id = body.client_id || null;
  }

  if ("notes" in body) {
    patch.notes = body.notes ? String(body.notes) : null;
  }

  if ("default_override_pct" in body) {
    const pct = Number(body.default_override_pct);
    if (Number.isNaN(pct)) {
      return NextResponse.json(
        { error: "Invalid default override %" },
        { status: 400 },
      );
    }
    patch.default_override_pct = pct;
  }

  if ("status" in body) {
    const status = String(body.status) as ProjectStatus;
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = status;
  }

  if ("project_manager_id" in body) {
    patch.project_manager_id = body.project_manager_id || null;
  }

  if ("material_budget" in body) {
    const value = body.material_budget;
    patch.material_budget =
      value == null || value === "" ? null : Number(value);
  }

  if ("labor_budget" in body) {
    const value = body.labor_budget;
    patch.labor_budget = value == null || value === "" ? null : Number(value);
  }

  const financialKeys = [
    "expense_budget",
    "subcontractor_budget",
    "overhead_budget",
    "original_revenue",
    "revenue_additions",
    "revenue_credits",
    "material_budget",
    "labor_budget",
    "labor_burden_enabled",
    "default_burden_pct",
  ] as const;

  const touchesFinancials = financialKeys.some((k) => k in body);

  if (touchesFinancials) {
    const profile = gate.profile!;
    if (!canViewFinancials(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  for (const key of [
    "expense_budget",
    "subcontractor_budget",
    "overhead_budget",
    "original_revenue",
  ] as const) {
    if (key in body) {
      const value = body[key];
      patch[key] = value == null || value === "" ? null : Number(value);
    }
  }

  if ("revenue_additions" in body) {
    patch.revenue_additions = Number(body.revenue_additions ?? 0) || 0;
  }
  if ("revenue_credits" in body) {
    patch.revenue_credits = Number(body.revenue_credits ?? 0) || 0;
  }
  if ("start_date" in body) {
    patch.start_date = body.start_date ? String(body.start_date) : null;
  }
  if ("target_completion_date" in body) {
    patch.target_completion_date = body.target_completion_date
      ? String(body.target_completion_date)
      : null;
  }
  if ("percent_complete" in body) {
    const pct = Number(body.percent_complete ?? 0);
    patch.percent_complete = Number.isFinite(pct)
      ? Math.min(100, Math.max(0, pct))
      : 0;
  }
  if ("labor_burden_enabled" in body) {
    patch.labor_burden_enabled = Boolean(body.labor_burden_enabled);
  }
  if ("default_burden_pct" in body) {
    patch.default_burden_pct = Number(body.default_burden_pct ?? 0) || 0;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select(
      "id, project_number, name, status, client_id, project_manager_id, default_override_pct, material_budget, labor_budget, expense_budget, subcontractor_budget, overhead_budget, original_revenue, revenue_additions, revenue_credits, start_date, target_completion_date, percent_complete, financials_updated_at, notes",
    )
    .single();

  if (error) {
    const lower = error.message.toLowerCase();
    const message =
      lower.includes("unique") || error.code === "23505"
        ? "A project with that number already exists"
        : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (touchesFinancials) {
    try {
      await rebuildProjectCostLedger(supabase, id);
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireProjectEditor(id);
  if ("error" in gate && gate.error) return gate.error;

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
