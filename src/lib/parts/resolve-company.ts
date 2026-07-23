import { newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Find or create a part_companies row by name (case-insensitive). */
export async function resolveCompanyId(
  supabase: Client,
  name: string | null | undefined,
  fallbackId: string | null = null,
): Promise<string | null> {
  const cleaned = String(name || "").trim();
  if (!cleaned) return fallbackId;

  const { data: existing } = await supabase
    .from("part_companies")
    .select("id, name")
    .ilike("name", cleaned)
    .limit(1);

  if (existing?.[0]?.id) return existing[0].id as string;

  // Broader case-insensitive match if ilike exact didn't hit
  const { data: all } = await supabase.from("part_companies").select("id, name");
  const hit = (all ?? []).find(
    (c) => String(c.name).toLowerCase() === cleaned.toLowerCase(),
  );
  if (hit?.id) return hit.id as string;

  const id = newId();
  const { data: created, error } = await supabase
    .from("part_companies")
    .insert({ id, name: cleaned })
    .select("id")
    .single();

  if (error || !created) return fallbackId;
  return created.id as string;
}
