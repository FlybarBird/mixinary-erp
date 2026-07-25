import { redirect } from "next/navigation";
import { getLocalDb, isLocalMode } from "@/lib/local/db";
import { getLocalSessionUserId } from "@/lib/local/session";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeUserRole,
  type UserProfile,
  type UserRole,
} from "@/lib/types";

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

export function canManageAdmin(role: UserRole) {
  return role === "administrator";
}

/** BOM commercial + material editing */
export function canEditBom(role: UserRole) {
  return role === "administrator" || role === "project_manager";
}

/** @deprecated use canEditBom — kept for existing call sites */
export function canEditPricing(role: UserRole) {
  return canEditBom(role);
}

export function canManageProjects(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing"
  );
}

export function canManageProcurement(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing"
  );
}

export function canManageVendors(role: UserRole) {
  return role === "administrator" || role === "purchasing";
}

export function canManageClients(role: UserRole) {
  return role === "administrator" || role === "project_manager";
}

export function canReceive(role: UserRole) {
  return (
    role === "administrator" ||
    role === "purchasing" ||
    role === "warehouse" ||
    role === "project_manager"
  );
}

export function canEditLabor(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "field"
  );
}

export function canApproveLabor(role: UserRole) {
  return role === "administrator" || role === "project_manager";
}

export function canEditExpenses(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "accounting" ||
    role === "field"
  );
}

export function canApproveExpenses(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "accounting"
  );
}

export function canViewFinancials(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing" ||
    role === "accounting"
  );
}

export function canApproveChangeOrders(role: UserRole) {
  return role === "administrator" || role === "project_manager";
}

export function canEditBilling(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "accounting"
  );
}

export function canManageApAndSubs(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing"
  );
}
