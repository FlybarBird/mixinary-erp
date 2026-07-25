import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewFinancials, getCurrentProfile } from "@/lib/auth";
import {
  laborExportHeaders,
  laborExportRow,
  sortLaborLines,
} from "@/lib/projects/labor-export";
import type { LaborEntry } from "@/lib/types";

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: unknown[]): string {
  return cols.map(esc).join(",");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeRates = canViewFinancials(profile.role);
  const supabase = await createClient();
  const [{ data: project }, { data: entries }] = await Promise.all([
    supabase
      .from("projects")
      .select("default_override_pct")
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("labor_entries").select("*").eq("project_id", projectId),
  ]);
  const defaultOverride = Number(project?.default_override_pct ?? 0);

  const sorted = sortLaborLines((entries ?? []) as LaborEntry[]);
  const headers = laborExportHeaders(includeRates);
  const rows = sorted.map((e, i) =>
    laborExportRow(e, includeRates, i, defaultOverride),
  );
  const csv = [row(headers), ...rows.map(row)].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="labor-${projectId}.csv"`,
    },
  });
}
