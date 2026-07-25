import { redirect } from "next/navigation";
import { getLocalDb, isLocalMode } from "@/lib/local/db";
import { getLocalSessionUserId } from "@/lib/local/session";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeUserRole,
  type UserProfile,
  type UserRole,
} from "@/lib/types";

export {
  canManageAdmin,
  canEditBom,
  canEditPricing,
  canManageProjects,
  canManageProcurement,
  canManageVendors,
  canManageClients,
  canReceive,
  canEditLabor,
  canApproveLabor,
  canEditExpenses,
  canApproveExpenses,
  canViewFinancials,
  canApproveChangeOrders,
  canEditBilling,
  canManageApAndSubs,
} from "@/lib/permissions";

function asProfile(row: {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  active?: boolean | number;
}): UserProfile {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: normalizeUserRole(row.role),
    active: row.active === undefined ? true : Boolean(row.active),
  };
}

export async function getSessionUser() {
  if (isLocalMode()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return null;
    const db = getLocalDb();
    const profile = db
      .prepare(
        "select id, email, full_name, role from user_profiles where id = ?",
      )
      .get(userId) as
      | { id: string; email: string; full_name: string | null; role: string }
      | undefined;
    if (!profile) return null;
    const normalized = asProfile(profile);
    return {
      id: normalized.id,
      email: normalized.email,
      user_metadata: {
        full_name: normalized.full_name,
        role: normalized.role,
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  if (isLocalMode()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return null;
    const db = getLocalDb();
    const profile = db
      .prepare(
        `select id, email, full_name, role, coalesce(active, 1) as active
         from user_profiles where id = ?`,
      )
      .get(userId) as
      | {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          active: number;
        }
      | undefined;
    if (!profile || !profile.active) return null;
    return {
      ...asProfile(profile),
      active: Boolean(profile.active),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || data.active === false) return null;

  return {
    ...asProfile(data as {
      id: string;
      email: string;
      full_name: string | null;
      role: string;
    }),
    active: data.active !== false,
  };
}

export async function requireProfile(roles?: UserRole[]) {
  const profile = await getCurrentProfile();
  if (!profile) {
    if (isLocalMode() && (await getLocalSessionUserId())) {
      redirect("/api/auth/logout?next=/login");
    }
    redirect("/login");
  }
  if (roles && !roles.includes(profile.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return profile;
}

