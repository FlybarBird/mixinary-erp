import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type DocNumberPrefix = "PO" | "CO" | "INV";

/**
 * Project #: YYYYMM + monthly sequence → 20260701
 * Docs #: PREFIX- + YYMM + projectSeq + seq → PO-26070101 / CO-26070101 / INV-26070101
 */

export function currentYearMonth(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return {
    yyyy,
    mm,
    yyyyMm: `${yyyy}${mm}`,
    yyMm: `${String(yyyy).slice(-2)}${mm}`,
  };
}

/** Parse automated project number into document stem pieces. */
export function parseProjectNumber(projectNumber: string): {
  yyyy: string;
  mm: string;
  seq: string;
  poStem: string;
} | null {
  const m = String(projectNumber ?? "").trim().match(/^(\d{4})(\d{2})(\d+)$/);
  if (!m) return null;
  const yyyy = m[1]!;
  const mm = m[2]!;
  const seq = m[3]!;
  const poStem = `${yyyy.slice(-2)}${mm}${seq.padStart(2, "0")}`;
  return { yyyy, mm, seq, poStem };
}

export function formatPoNumber(poStem: string, poSeq: number): string {
  return formatDocNumber("PO", poStem, poSeq);
}

export function formatDocNumber(
  prefix: DocNumberPrefix,
  stem: string,
  seq: number,
): string {
  return `${prefix}-${stem}${String(seq).padStart(2, "0")}`;
}

/** Next project number for the current (or given) month: 20260701, 20260702, … */
export async function allocateNextProjectNumber(
  supabase: Client,
  date = new Date(),
): Promise<string> {
  const { yyyyMm } = currentYearMonth(date);
  const { data } = await supabase
    .from("projects")
    .select("project_number")
    .ilike("project_number", `${yyyyMm}%`);

  let maxSeq = 0;
  const re = new RegExp(`^${yyyyMm}(\\d+)$`);
  for (const row of data ?? []) {
    const match = String(row.project_number ?? "").match(re);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1]!, 10));
  }

  return `${yyyyMm}${String(maxSeq + 1).padStart(2, "0")}`;
}

/**
 * Highest document sequence for a project under the automated scheme,
 * or under legacy PREFIX-NNN.
 */
function maxDocSequence(
  existing: Array<Record<string, unknown>>,
  field: string,
  prefix: DocNumberPrefix,
  stem: string | null,
): number {
  let max = 0;
  if (stem) {
    const re = new RegExp(`^${prefix}-${stem}(\\d+)$`);
    for (const row of existing) {
      const match = String(row[field] ?? "").match(re);
      if (match) max = Math.max(max, parseInt(match[1]!, 10));
    }
    return max;
  }
  const legacy = new RegExp(`^${prefix}-(\\d+)$`);
  for (const row of existing) {
    const match = String(row[field] ?? "").match(legacy);
    if (match) max = Math.max(max, parseInt(match[1]!, 10));
  }
  return max;
}

async function allocateNextDocNumbers(
  supabase: Client,
  projectId: string,
  opts: {
    table: string;
    field: string;
    prefix: DocNumberPrefix;
    count: number;
  },
): Promise<string[]> {
  const { table, field, prefix, count } = opts;
  if (count <= 0) return [];

  const [{ data: project }, { data: existing }] = await Promise.all([
    supabase
      .from("projects")
      .select("project_number")
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from(table).select(field).eq("project_id", projectId),
  ]);

  const parsed = project?.project_number
    ? parseProjectNumber(String(project.project_number))
    : null;
  const start =
    maxDocSequence(
      (existing ?? []) as Array<Record<string, unknown>>,
      field,
      prefix,
      parsed?.poStem ?? null,
    ) + 1;

  if (parsed) {
    return Array.from({ length: count }, (_, i) =>
      formatDocNumber(prefix, parsed.poStem, start + i),
    );
  }

  return Array.from(
    { length: count },
    (_, i) => `${prefix}-${String(start + i).padStart(3, "0")}`,
  );
}

/** Next PO number(s) for a project: PO-26070101, PO-26070102, … */
export async function allocateNextPoNumbers(
  supabase: Client,
  projectId: string,
  count = 1,
): Promise<string[]> {
  return allocateNextDocNumbers(supabase, projectId, {
    table: "purchase_orders",
    field: "po_number",
    prefix: "PO",
    count,
  });
}

export async function allocateNextPoNumber(
  supabase: Client,
  projectId: string,
): Promise<string> {
  const [number] = await allocateNextPoNumbers(supabase, projectId, 1);
  return number ?? "PO-001";
}

/** Next change order number: CO-26070101, … */
export async function allocateNextCoNumber(
  supabase: Client,
  projectId: string,
): Promise<string> {
  const [number] = await allocateNextDocNumbers(supabase, projectId, {
    table: "project_change_orders",
    field: "co_number",
    prefix: "CO",
    count: 1,
  });
  return number ?? "CO-001";
}

/** Next invoice number: INV-26070101, … */
export async function allocateNextInvoiceNumber(
  supabase: Client,
  projectId: string,
): Promise<string> {
  const [number] = await allocateNextDocNumbers(supabase, projectId, {
    table: "project_invoices",
    field: "invoice_number",
    prefix: "INV",
    count: 1,
  });
  return number ?? "INV-001";
}
