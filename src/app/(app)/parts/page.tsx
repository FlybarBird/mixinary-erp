import { canEditPricing, requireProfile } from "@/lib/auth";
import { PartsLibrary } from "@/components/PartsLibrary";
import { createClient } from "@/lib/supabase/server";
import type { PartCategory, PartCompany, Vendor } from "@/lib/types";

export default async function PartsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: categories }, { data: companies }, { data: vendors }] =
    await Promise.all([
      supabase.from("part_categories").select("*").order("sort_order"),
      supabase.from("part_companies").select("*").order("name"),
      supabase.from("vendors").select("*").order("code"),
    ]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Parts</h1>
        <p className="page-sub">
          Catalog of products by category and manufacturer. Use Pick part in a
          project BOM to insert these onto jobs.
        </p>
      </div>
      <PartsLibrary
        canEdit={canEditPricing(profile.role)}
        initialCategories={(categories ?? []) as PartCategory[]}
        initialCompanies={(companies ?? []) as PartCompany[]}
        vendors={(vendors ?? []) as Vendor[]}
      />
    </div>
  );
}
