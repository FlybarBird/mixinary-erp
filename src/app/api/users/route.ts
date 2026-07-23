import { NextResponse } from "next/server";
import { canManageAdmin, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeUserRole, USER_ROLES } from "@/lib/types";

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const role = normalizeUserRole(body.role);
  if (!USER_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ role })
    .eq("id", String(body.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
