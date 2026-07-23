import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserProfile, UserRole } from "@/lib/types";

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return data as UserProfile | null;
}

export async function requireProfile(roles?: UserRole[]) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (roles && !roles.includes(profile.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return profile;
}

export function canEditPricing(role: UserRole) {
  return role === "admin" || role === "estimator";
}

export function canManageAdmin(role: UserRole) {
  return role === "admin";
}
