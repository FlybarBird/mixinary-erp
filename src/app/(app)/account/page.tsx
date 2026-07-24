import { requireProfile } from "@/lib/auth";
import { AccountForm } from "@/components/AccountForm";
import { isLocalMode } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const profile = await requireProfile();
  let authMethods = ["password"];
  if (!isLocalMode()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const identities = user?.identities?.map((i) => i.provider) ?? [];
    if (identities.length) authMethods = identities;
  }

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Account</h1>
        <p className="page-sub">Update your profile and password.</p>
      </div>
      <AccountForm profile={profile} authMethods={authMethods} />
    </div>
  );
}
