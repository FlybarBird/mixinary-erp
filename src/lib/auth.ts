import { redirect } from "next/navigation";
import { getLocalDb, isLocalMode } from "@/lib/local/db";
import { getLocalSessionUserId } from "@/lib/local/session";
import { createClient } from "@/lib/supabase/server";
import {
  normalizePermissionOverride,
  normalizeUserRole,
  type UserProfile,
  type UserRole,
} from "@/lib/types";

export {
  canManageAdmin,
  canEditBom,
  canEditPricing,
  canCreateProjects,
  canManageProjects,
  canManageProcurement,
  canManageVendors,
  canManageClients,
  canReceive,
  canEditLabor,
  canApproveLabor,
  canEditExpenses,
  canApproveExpenses,
  canViewExpenses,
  canViewFinancials,
  canViewMoney,
  canEditChangeOrders,
  canApproveChangeOrders,
  canEditBilling,
  canEditClientDocuments,
  canManageAp,
  canEditSubcontracts,
  canManageApAndSubs,
  resolveCreateProjects,
  resolveViewMoney,
} from "@/lib/permissions";

function asProfile(row: {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  active?: boolean | number;
  create_projects_override?: string | null;
}): UserProfile {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: normalizeUserRole(row.role),
    active: row.active === undefined ? true : Boolean(row.active),
    create_projects_override: normalizePermissionOverride(
      row.create_projects_override,
    ),
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
        `select id, email, full_name, role, coalesce(active, 1) as active,
                create_projects_override
         from user_profiles where id = ?`,
      )
      .get(userId) as
      | {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          active: number;
          create_projects_override: string | null;
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
    .select("id, email, full_name, role, active, create_projects_override")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || data.active === false) return null;

  return {
    ...asProfile(data as {
      id: string;
      email: string;
      full_name: string | null;
      role: string;
      create_projects_override?: string | null;
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

