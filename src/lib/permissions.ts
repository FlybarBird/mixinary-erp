import type { UserRole } from "@/lib/types";

/** Pure role checks — safe for Client Components (no next/headers). */

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

/** Client Documents add-on: create/edit/send customer-facing documents */
export function canEditClientDocuments(role: UserRole) {
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
