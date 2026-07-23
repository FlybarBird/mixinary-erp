import ExcelJS from "exceljs";
import type { OrderStatus } from "@/lib/types";

const SKIP_SHEETS = new Set([
  "CarrierList",
  "Template as of 20250313",
  "4k Template",
  "41u RACK CONFIG",
]);

const TEMPLATE_SHEETS = [
  "Template as of 20250313",
  "4k Template",
  "41u RACK CONFIG",
];

export interface ImportedLine {
  description: string;
  qty: number;
  msrp: number;
  quote: number | null;
  overridePct: number | null;
  vendorCode: string | null;
  orderStatus: OrderStatus;
  tracking: string | null;
  notes: string | null;
  sectionName: string;
}

export interface ImportedProject {
  sheetName: string;
  projectNumber: string;
  name: string;
  clientName: string;
  defaultOverridePct: number;
  lines: ImportedLine[];
}

export interface ImportedTemplate {
  name: string;
  defaultOverridePct: number;
  lines: ImportedLine[];
}

function cellStr(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value && value.text) {
    return String(value.text);
  }
  if (typeof value === "object" && "result" in value) {
    return String((value as ExcelJS.CellFormulaValue).result ?? "");
  }
  return String(value);
}

function cellNum(value: ExcelJS.CellValue): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "result" in value) {
    const r = (value as ExcelJS.CellFormulaValue).result;
    return typeof r === "number" ? r : Number(r);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseProjectMeta(sheetName: string) {
  const match = sheetName.match(/^(\d{3,5})\s+(.+)$/);
  if (match) {
    return {
      projectNumber: match[1],
      name: match[2].trim(),
      clientName: match[2].trim(),
    };
  }
  return {
    projectNumber: sheetName.replace(/\s+/g, "-").slice(0, 32),
    name: sheetName,
    clientName: sheetName,
  };
}

function mapStatus(raw: string): OrderStatus {
  const s = raw.trim().toLowerCase();
  if (s === "ordered") return "ordered";
  if (s === "shipped") return "shipped";
  return "none";
}

function isSectionHeader(item: string, qty: number | null, msrp: number | null) {
  if (!item) return false;
  if (qty != null || (msrp != null && msrp !== 0)) return false;
  const known = [
    "hardware",
    "rack/materials",
    "products",
    "integration",
    "shure",
    "shure stuff",
    "elite core",
    "cable contingency",
  ];
  return known.includes(item.trim().toLowerCase()) || item.length < 40;
}

async function parseSheetLines(
  worksheet: ExcelJS.Worksheet,
): Promise<{ lines: ImportedLine[]; defaultOverridePct: number }> {
  const lines: ImportedLine[] = [];
  let sectionName = "General";
  let defaultOverridePct = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 4) return;

    const item = cellStr(row.getCell(3).value).trim();
    const qty = cellNum(row.getCell(4).value) ?? cellNum(row.getCell(7).value);
    const msrp = cellNum(row.getCell(8).value);
    const quote = cellNum(row.getCell(10).value);
    const overridePct = cellNum(row.getCell(13).value);
    const vendorCode = cellStr(row.getCell(20).value).trim() || null;
    const notes = cellStr(row.getCell(6).value).trim() || null;
    const tracking = cellStr(row.getCell(5).value).trim() || null;
    const statusRaw = cellStr(row.getCell(22).value) || cellStr(row.getCell(1).value);

    // Project default override often lives near Products total row (O16 in template)
    if (rowNumber === 16) {
      const maybe = cellNum(row.getCell(15).value);
      if (maybe != null && maybe >= 0 && maybe < 2) defaultOverridePct = maybe;
    }

    if (!item) return;

    if (isSectionHeader(item, qty, msrp) && (qty == null || qty === 0)) {
      sectionName = item;
      return;
    }

    if (["Products", "Integration", "Cable Contingency"].includes(item)) {
      return;
    }

    lines.push({
      description: item,
      qty: qty ?? 1,
      msrp: msrp ?? 0,
      quote,
      overridePct,
      vendorCode,
      orderStatus: mapStatus(statusRaw),
      tracking,
      notes,
      sectionName,
    });
  });

  return { lines, defaultOverridePct };
}

export async function parseMasterWorkbook(buffer: Buffer): Promise<{
  projects: ImportedProject[];
  templates: ImportedTemplate[];
  carriers: { name: string; slug: string }[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);

  const projects: ImportedProject[] = [];
  const templates: ImportedTemplate[] = [];
  const carriers: { name: string; slug: string }[] = [];

  for (const worksheet of workbook.worksheets) {
    const name = worksheet.name;

    if (name === "CarrierList") {
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber < 1) return;
        const carrierName = cellStr(row.getCell(1).value).trim();
        const slug = cellStr(row.getCell(2).value).trim();
        if (carrierName && slug) carriers.push({ name: carrierName, slug });
      });
      continue;
    }

    const { lines, defaultOverridePct } = await parseSheetLines(worksheet);

    if (TEMPLATE_SHEETS.includes(name)) {
      templates.push({ name, defaultOverridePct, lines });
      continue;
    }

    if (SKIP_SHEETS.has(name)) continue;
    if (lines.length === 0) continue;

    const meta = parseProjectMeta(name);
    projects.push({
      sheetName: name,
      ...meta,
      defaultOverridePct,
      lines,
    });
  }

  return { projects, templates, carriers };
}
