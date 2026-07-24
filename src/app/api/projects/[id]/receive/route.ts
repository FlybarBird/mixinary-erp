import { NextResponse } from "next/server";
import { canManageProcurement, canReceive, getCurrentProfile } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import {
  loadReceiveItemSummary,
  receivePoItem,
} from "@/lib/projects/receive";

async function authorizeReceive(projectId: string) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!canReceive(profile.role) && !canManageProcurement(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { profile };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const gate = await authorizeReceive(projectId);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId") || url.searchParams.get("item");
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await loadReceiveItemSummary(supabase, projectId, itemId);
  if (!result.data) {
    return NextResponse.json(
      { error: result.error ?? "Not found" },
      { status: result.status ?? 404 },
    );
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const gate = await authorizeReceive(projectId);
  if ("error" in gate && gate.error) return gate.error;
  const profile = gate.profile!;

  const body = (await request.json()) as {
    itemId?: string;
    qty_received?: number | null;
  };
  const itemId = String(body.itemId || "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await receivePoItem(supabase, {
    projectId,
    itemId,
    qtyReceived: body.qty_received,
    actorId: profile.id,
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json(result);
}
