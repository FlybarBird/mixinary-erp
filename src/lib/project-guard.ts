import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import type { ProjectAccessRole, UserProfile, UserRole } from "@/lib/types";

/**
 * Resolved request context for /api/projects/[id]/** routes.
 *
 * Guarantees the caller is an authenticated, assigned project member
 * (administrators bypass membership). Combine `canEdit(globalCheck)` with a
 * global-role helper to enforce "project Editor/Manager AND global role".
 */
export interface ProjectApiContext {
  profile: UserProfile;
  access: ProjectAccessRole | "administrator";
  /** Effective View money permission on this project. */
  canViewMoney: boolean;
  /** True when the member is Editor/Manager (or admin) AND the global role check passes. */
  canEdit(globalCheck: (role: UserRole) => boolean): boolean;
}

/**
 * Authorize a project-scoped API request.
 * Returns a NextResponse (401 unauthenticated / 404 not a member) on failure.
 */
export async function requireProjectApiContext(
  projectId: string,
): Promise<ProjectApiContext | NextResponse> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const membership = await getProjectMembership(
    profile.id,
    profile.role,
    projectId,
  );
  if (!membership.access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const access = membership.access;
  return {
    profile,
    access,
    canViewMoney: membership.canViewMoney,
    canEdit: (globalCheck) =>
      canEditProjectContent(profile.role, access, globalCheck(profile.role)),
  };
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}
