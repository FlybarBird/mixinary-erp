import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, getCurrentProfile } from "@/lib/auth";
import { renumberPurchaseOrder } from "@/lib/projects/po-move";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const { id: projectId, poId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    po_number?: string;
    preview?: boolean;
  };
  const poNumber = String(body.po_number || "").trim();
  if (!poNumber) {
    return NextResponse.json({ error: "po_number required" }, { status: 400 });
  }

  const supabase = await createClient();

  if (body.preview) {
    const { data: existing } = await supabase
      .from("purchase_orders")
      .select("id, project_id, po_number")
      .eq("id", poId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { data: clash } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("project_id", existing.project_id)
      .eq("po_number", poNumber)
      .neq("id", poId)
      .maybeSingle();
    return NextResponse.json({
      data: {
        before: existing.po_number,
        after: poNumber,
        available: !clash,
        clash: Boolean(clash),
      },
    });
  }

  try {
    const result = await renumberPurchaseOrder(supabase, {
      projectId,
      poId,
      poNumber,
      actorId: profile.id,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Renumber failed" },
      { status: 400 },
    );
  }
}
