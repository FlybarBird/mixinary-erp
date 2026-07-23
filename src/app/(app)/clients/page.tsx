import { canEditPricing, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientManager } from "@/components/ClientManager";

export default async function ClientsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Clients</h1>
        <p className="page-sub">Churches, schools, and other install customers.</p>
      </div>
      <ClientManager
        initialClients={clients ?? []}
        canEdit={canEditPricing(profile.role)}
      />
    </div>
  );
}
