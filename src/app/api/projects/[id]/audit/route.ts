import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectApiContext } from "@/lib/project-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data ?? [] });
}
