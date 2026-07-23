import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PriceSourceManager } from "@/components/PriceSourceManager";

export default async function PriceSourcesPage() {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { data: sources } = await supabase
    .from("price_sources")
    .select("*")
    .order("name");

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Price sources</h1>
        <p className="page-sub">
          Allowlisted domains for AI MSRP lookup. Disabled or non-searchable
          sources still accept paste-URL fetches when the domain matches.
        </p>
      </div>
      <PriceSourceManager initialSources={sources ?? []} />
    </div>
  );
}
