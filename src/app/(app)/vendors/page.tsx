import { canManageAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VendorManager } from "@/components/VendorManager";

export default async function VendorsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("code");

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Vendors</h1>
        <p className="page-sub">Dealer and supplier codes used on BOM lines.</p>
      </div>
      <VendorManager
        initialVendors={vendors ?? []}
        canEdit={canManageAdmin(profile.role)}
      />
    </div>
  );
}
