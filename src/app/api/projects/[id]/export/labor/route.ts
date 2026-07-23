import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

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
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("project_id", projectId)
    .order("work_date");

  const headers = [
    "Work Date",
    "Worker Name",
    "Category",
    "Task Description",
    "Estimated Hours",
    "Actual Hours",
    "Regular Hours",
    "Overtime Hours",
    "Hourly Rate",
    "Total Cost",
    "Approval Status",
    "Notes",
  ];

  const rows = (entries ?? []).map((e) => [
    e.work_date,
    e.worker_name,
    e.work_category ?? "",
    e.task_description ?? "",
    e.estimated_hours,
    e.actual_hours,
    e.regular_hours,
    e.overtime_hours,
    e.hourly_rate,
    e.total_cost,
    e.approval_status,
    e.notes ?? "",
  ]);

  const csv = [row(headers), ...rows.map(row)].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="labor-${projectId}.csv"`,
    },
  });
}
