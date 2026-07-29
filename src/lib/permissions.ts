import type { PermissionOverride, UserRole } from "@/lib/types";

/** Pure role checks — safe for Client Components (no next/headers). */

export function canManageAdmin(role: UserRole) {
  return role === "administrator";
}

/**
 * View any money / $ value — global role default.
 * Per-project members may override this via project_members.view_money
 * (inherit/allow/deny); resolve with resolveViewMoney().
 */
export function canViewMoney(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing" ||
    role === "accounting"
  );
}

/**
 * Resolve effective money visibility for one user on one project.
 * Administrators always see money (a project override may not deny them).
 */
export function resolveViewMoney(
  role: UserRole,
  override: PermissionOverride | null | undefined,
) {
  if (role === "administrator") return true;
  if (override === "allow") return true;
  if (override === "deny") return false;
  return canViewMoney(role);
}

/**
 * Create projects — global role default.
 * Per-user override via user_profiles.create_projects_override
 * (inherit/allow/deny); resolve with resolveCreateProjects().
 */
export function canCreateProjects(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing"
  );
}

/** Resolve effective create-projects permission for one user. */
export function resolveCreateProjects(
  role: UserRole,
  override: PermissionOverride | null | undefined,
) {
  if (role === "administrator") return true;
  if (override === "allow") return true;
  if (override === "deny") return false;
  return canCreateProjects(role);
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

/** Procurement / PO editing, incl. shipment detail edits on Tracking. */
export function canManageProcurement(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing" ||
    role === "warehouse"
  );
}

export function canManageVendors(role: UserRole) {
  return (
    role === "administrator" ||
    role === "purchasing" ||
    role === "accounting"
  );
}

export function canManageClients(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "accounting"
  );
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

/** Expenses page visibility — every role except Read-Only. */
export function canViewExpenses(role: UserRole) {
  return role !== "read_only";
}

export function canViewFinancials(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing" ||
    role === "accounting"
  );
}

export function canEditChangeOrders(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
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

/** Client Documents add-on: create/edit/send customer-facing documents */
export function canEditClientDocuments(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "accounting"
  );
}

/** Billing — manage vendor bills / AP. */
export function canManageAp(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing"
  );
}

/** Subcontracts — edit. */
export function canEditSubcontracts(role: UserRole) {
  return (
    role === "administrator" ||
    role === "project_manager" ||
    role === "purchasing" ||
    role === "accounting"
  );
}

/** @deprecated split into canManageAp / canEditSubcontracts */
export function canManageApAndSubs(role: UserRole) {
  return canManageAp(role);
}
