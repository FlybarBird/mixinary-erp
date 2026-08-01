import { createClient } from "@/lib/supabase/server";
import { normalizeLabelPrinterBrand } from "@/lib/labels/rows";
import type { CompanySettings } from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;

export const COMPANY_SETTINGS_ID = "default";

const DEFAULTS: CompanySettings = {
  id: COMPANY_SETTINGS_ID,
  client_documents_enabled: false,
  label_printer: "dymo",
  legal_name: null,
  address: null,
  contact_email: null,
  contact_phone: null,
  tax_id: null,
  logo_path: null,
  brand_color_primary: "#0070f2",
  brand_color_accent: "#223548",
  default_terms: null,
  default_payment_instructions: null,
};

function normalize(row: Record<string, unknown> | null): CompanySettings {
  if (!row) return { ...DEFAULTS };
  return {
    id: String(row.id ?? COMPANY_SETTINGS_ID),
    client_documents_enabled: Boolean(row.client_documents_enabled),
    label_printer: normalizeLabelPrinterBrand(row.label_printer),
    legal_name: (row.legal_name as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    contact_email: (row.contact_email as string | null) ?? null,
    contact_phone: (row.contact_phone as string | null) ?? null,
    tax_id: (row.tax_id as string | null) ?? null,
    logo_path: (row.logo_path as string | null) ?? null,
    brand_color_primary:
      (row.brand_color_primary as string | null) || DEFAULTS.brand_color_primary,
    brand_color_accent:
      (row.brand_color_accent as string | null) || DEFAULTS.brand_color_accent,
    default_terms: (row.default_terms as string | null) ?? null,
    default_payment_instructions:
      (row.default_payment_instructions as string | null) ?? null,
    updated_at: (row.updated_at as string | undefined) ?? undefined,
  };
}

/** Load the singleton company settings row (defaults when missing). */
export async function getCompanySettings(
  client?: Client,
): Promise<CompanySettings> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", COMPANY_SETTINGS_ID)
    .maybeSingle();
  return normalize((data as Record<string, unknown> | null) ?? null);
}

export async function updateCompanySettings(
  patch: Partial<Omit<CompanySettings, "id">>,
  client?: Client,
): Promise<CompanySettings> {
  const supabase = client ?? (await createClient());
  const existing = await supabase
    .from("company_settings")
    .select("id")
    .eq("id", COMPANY_SETTINGS_ID)
    .maybeSingle();

  const values = { ...patch, updated_at: new Date().toISOString() };
  if (existing.data) {
    await supabase
      .from("company_settings")
      .update(values)
      .eq("id", COMPANY_SETTINGS_ID);
  } else {
    await supabase
      .from("company_settings")
      .insert({ id: COMPANY_SETTINGS_ID, ...values });
  }
  return getCompanySettings(supabase);
}
