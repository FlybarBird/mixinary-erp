import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserRoleManager } from "@/components/UserRoleManager";
import { normalizeUserRole } from "@/lib/types";

export default async function UsersPage() {
  await requireProfile(["administrator"]);
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, role")
    .order("email");

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Users</h1>
        <p className="page-sub">
          Invite teammates from the Supabase Auth dashboard, then set roles here.
        </p>
      </div>
      <UserRoleManager
        initialUsers={(users ?? []).map((u) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: normalizeUserRole(String(u.role)),
        }))}
      />
    </div>
  );
}
