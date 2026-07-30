import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  canApproveChangeOrders,
  canApproveExpenses,
  canApproveLabor,
  canEditBilling,
  canEditBom,
  canEditClientDocuments,
  canEditExpenses,
  canEditLabor,
  canManageAdmin,
  canManageApAndSubs,
  canManageClients,
  canManageProcurement,
  canManageProjects,
  canManageVendors,
  canReceive,
  canViewFinancials,
} from "@/lib/permissions";

/** Current staff profile for native / API clients (cookie or Bearer JWT). */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    profile,
    capabilities: {
      manageAdmin: canManageAdmin(profile.role),
      manageProjects: canManageProjects(profile.role),
      editBom: canEditBom(profile.role),
      manageProcurement: canManageProcurement(profile.role),
      manageVendors: canManageVendors(profile.role),
      manageClients: canManageClients(profile.role),
      receive: canReceive(profile.role),
      editLabor: canEditLabor(profile.role),
      approveLabor: canApproveLabor(profile.role),
      editExpenses: canEditExpenses(profile.role),
      approveExpenses: canApproveExpenses(profile.role),
      viewFinancials: canViewFinancials(profile.role),
      approveChangeOrders: canApproveChangeOrders(profile.role),
      editBilling: canEditBilling(profile.role),
      editClientDocuments: canEditClientDocuments(profile.role),
      manageApAndSubs: canManageApAndSubs(profile.role),
    },
  });
}
