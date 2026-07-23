import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserRoleManager } from "@/components/UserRoleManager";

export default async function UsersPage() {
  await requireProfile(["admin"]);
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
          Invite teammates from the Supabase Auth dashboard, then set roles here
          (admin / estimator / tech).
        </p>
      </div>
      <UserRoleManager initialUsers={users ?? []} />
    </div>
  );
}
