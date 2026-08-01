import type { ProjectListItem, UserProfile } from "@mixinary/domain";
import { config } from "./config";
import { supabase } from "./supabase";

export type MeResponse = {
  profile: UserProfile;
  capabilities: Record<string, boolean>;
};

export type ProjectsResponse = {
  projects: ProjectListItem[];
  can_manage: boolean;
};

export type ProjectDetailResponse = {
  project: ProjectListItem & Record<string, unknown>;
  access_role: string | null;
  can_edit: boolean;
  can_view_financials: boolean;
};

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await accessToken();
  if (!token) {
    throw new Error("Not signed in");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text || res.statusText };
  }

  if (!res.ok) {
    const err =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(err);
  }

  return json as T;
}

export function fetchMe() {
  return apiFetch<MeResponse>("/api/me");
}

export function fetchProjects(status: "active" | "archived" | "all" = "active") {
  const q = status === "active" ? "" : `?status=${status}`;
  return apiFetch<ProjectsResponse>(`/api/projects${q}`);
}

export function fetchProject(id: string) {
  return apiFetch<ProjectDetailResponse>(`/api/projects/${id}`);
}
