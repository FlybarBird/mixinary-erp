import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { canViewFinancials, getCurrentProfile } from "@/lib/auth";
import {
  laborExportHeaders,
  laborExportRow,
  laborExportTotals,
  sortLaborLines,
} from "@/lib/projects/labor-export";
import type { LaborEntry } from "@/lib/types";

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
      .select("project_number, name, default_override_pct")
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("labor_entries").select("*").eq("project_id", projectId),
  ]);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const defaultOverride = Number(project.default_override_pct ?? 0);
  const sorted = sortLaborLines((entries ?? []) as LaborEntry[]);
  const totals = laborExportTotals(sorted, defaultOverride);
  const headers = laborExportHeaders(includeRates);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mixinary ERP";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["Project #", project.project_number]);
  summary.addRow(["Project", project.name]);
  summary.addRow(["As of", new Date().toISOString()]);
  summary.addRow([]);
  summary.addRow(["Qty", totals.qty]);
  if (includeRates) {
    summary.addRow(["Total EST", totals.totalMsrp]);
    summary.addRow(["Total Quote", totals.totalQuote]);
    summary.addRow(["Total Sale", totals.totalSale]);
    summary.addRow(["Labor Profit", totals.profit]);
  }

  const linesSheet = workbook.addWorksheet("Lines");
  linesSheet.addRow(headers);
  for (const [i, entry] of sorted.entries()) {
    linesSheet.addRow(
      laborExportRow(entry, includeRates, i, defaultOverride),
    );
  }
  linesSheet.getRow(1).font = { bold: true };
  linesSheet.columns.forEach((col) => {
    col.width = 14;
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const filename = `labor-${project.project_number || projectId}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
