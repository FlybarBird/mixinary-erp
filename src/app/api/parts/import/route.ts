import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";

function cellStr(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value && value.text) {
    return String(value.text);
  }
  if (typeof value === "object" && "result" in value) {
    return String((value as ExcelJS.CellFormulaValue).result ?? "");
  }
  return String(value).trim();
}

function cellNum(value: ExcelJS.CellValue): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Empty workbook" }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: categories }, { data: companies }, { data: vendors }] =
    await Promise.all([
      supabase.from("part_categories").select("id, name"),
      supabase.from("part_companies").select("id, name"),
      supabase.from("vendors").select("id, code"),
    ]);

  const categoryByName = new Map(
    (categories ?? []).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const companyByName = new Map(
    (companies ?? []).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const vendorByCode = new Map(
    (vendors ?? []).map((v) => [v.code.toLowerCase(), v.id]),
  );

  // Expected header: sku,name,description,category,company,msrp,quote,vendor_code,upc
  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = cellStr(row.getCell(2).value);
    if (!name) return;
    rows.push({
      id: newId(),
      sku: cellStr(row.getCell(1).value) || null,
      name,
      description: cellStr(row.getCell(3).value) || null,
      category_id:
        categoryByName.get(cellStr(row.getCell(4).value).toLowerCase()) ?? null,
      company_id:
        companyByName.get(cellStr(row.getCell(5).value).toLowerCase()) ?? null,
      msrp: cellNum(row.getCell(6).value) ?? 0,
      default_quote: cellNum(row.getCell(7).value),
      default_vendor_id:
        vendorByCode.get(cellStr(row.getCell(8).value).toLowerCase()) ?? null,
      upc: cellStr(row.getCell(9).value) || null,
      source: "import",
      active: true,
    });
  });

  let created = 0;
  for (const row of rows) {
    const { error } = await supabase.from("catalog_parts").insert(row);
    if (!error) created += 1;
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped: Math.max(0, rows.length - created),
  });
}
