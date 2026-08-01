import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, getCurrentProfile } from "@/lib/auth";
import { moveOrSplitPoItem } from "@/lib/projects/po-move";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; poId: string; itemId: string }> },
) {
  const { id: projectId, poId, itemId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    target_po_id?: string;
    qty?: number | null;
  };
  if (!body.target_po_id) {
    return NextResponse.json({ error: "target_po_id required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const result = await moveOrSplitPoItem(supabase, {
      projectId,
      sourcePoId: poId,
      targetPoId: body.target_po_id,
      itemId,
      qty: body.qty,
      actorId: profile.id,
    });

    try {
      await rebuildProjectCostLedger(supabase, projectId);
    } catch {
      // non-fatal
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Move failed" },
      { status: 400 },
    );
  }
}
