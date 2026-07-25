import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Project #: YYYYMM + monthly sequence → 20260701
 * PO #: PO- + YYMM + projectSeq + poSeq → PO-26070101
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

/** Parse automated project number into PO stem pieces. */
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
  return `PO-${poStem}${String(poSeq).padStart(2, "0")}`;
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
 * Highest PO sequence for a project under the automated scheme,
 * or under legacy PO-NNN.
 */
function maxPoSequence(
  existing: Array<{ po_number?: string | null }>,
  poStem: string | null,
): number {
  let max = 0;
  if (poStem) {
    const re = new RegExp(`^PO-${poStem}(\\d+)$`);
    for (const row of existing) {
      const match = String(row.po_number ?? "").match(re);
      if (match) max = Math.max(max, parseInt(match[1]!, 10));
    }
    return max;
  }
  for (const row of existing) {
    const match = String(row.po_number ?? "").match(/^PO-(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1]!, 10));
  }
  return max;
}

/** Next PO number(s) for a project: PO-26070101, PO-26070102, … */
export async function allocateNextPoNumbers(
  supabase: Client,
  projectId: string,
  count = 1,
): Promise<string[]> {
  if (count <= 0) return [];

  const [{ data: project }, { data: existing }] = await Promise.all([
    supabase
      .from("projects")
      .select("project_number")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("purchase_orders")
      .select("po_number")
      .eq("project_id", projectId),
  ]);

  const parsed = project?.project_number
    ? parseProjectNumber(String(project.project_number))
    : null;
  const start = maxPoSequence(existing ?? [], parsed?.poStem ?? null) + 1;

  if (parsed) {
    return Array.from({ length: count }, (_, i) =>
      formatPoNumber(parsed.poStem, start + i),
    );
  }

  return Array.from(
    { length: count },
    (_, i) => `PO-${String(start + i).padStart(3, "0")}`,
  );
}

export async function allocateNextPoNumber(
  supabase: Client,
  projectId: string,
): Promise<string> {
  const [number] = await allocateNextPoNumbers(supabase, projectId, 1);
  return number ?? "PO-001";
}
