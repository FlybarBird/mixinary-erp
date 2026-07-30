
/**
 * Plane API client — never touches Plane DB directly.
 */
export async function planeFetch(path, { method = "GET", body, token } = {}) {
  const base = (process.env.PLANE_API_BASE_URL || "").replace(/\/$/, "");
  const auth = token || process.env.PLANE_API_TOKEN || "";
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Plane API ${method} ${path} failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function createPlaneProject({ name, templateSlug, workspaceSlug }) {
  // Placeholder contract — wired to Plane workspace project create API in deploy env.
  if (process.env.PLANE_DRY_RUN === "1" || !process.env.PLANE_API_TOKEN) {
    return {
      id: `dry-plane-${Buffer.from(name).toString("hex").slice(0, 12)}`,
      name,
      templateSlug,
      workspaceSlug,
      dryRun: true,
    };
  }
  return planeFetch(`/api/v1/workspaces/${workspaceSlug}/projects/`, {
    method: "POST",
    body: { name, template: templateSlug },
  });
}

export async function addPlaneProjectMembers(planeProjectId, members) {
  if (process.env.PLANE_DRY_RUN === "1" || !process.env.PLANE_API_TOKEN) {
    return { ok: true, dryRun: true, planeProjectId, members };
  }
  return planeFetch(`/api/v1/projects/${planeProjectId}/members/`, {
    method: "POST",
    body: { members },
  });
}
