/**
 * Huly API client — never touches Huly DB directly.
 */
export async function hulyFetch(path, { method = "GET", body, token } = {}) {
  const base = (process.env.HULY_API_BASE_URL || process.env.PLANE_API_BASE_URL || "").replace(/\/$/, "");
  const auth = token || process.env.HULY_API_TOKEN || process.env.PLANE_API_TOKEN || "";
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
    const err = new Error(`Huly API ${method} ${path} failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function createHulyProject({ name, templateSlug, workspaceSlug }) {
  if (process.env.HULY_DRY_RUN === "1" || process.env.PLANE_DRY_RUN === "1" || !process.env.HULY_API_TOKEN) {
    return {
      id: `dry-huly-${Buffer.from(name).toString("hex").slice(0, 12)}`,
      name,
      templateSlug,
      workspaceSlug,
      dryRun: true,
    };
  }
  // Contract endpoint — wire to Huly project/create API in deploy env.
  return hulyFetch(`/api/v1/workspaces/${workspaceSlug}/projects`, {
    method: "POST",
    body: { name, template: templateSlug },
  });
}

export async function addHulyProjectMembers(hulyProjectId, members) {
  if (process.env.HULY_DRY_RUN === "1" || process.env.PLANE_DRY_RUN === "1" || !process.env.HULY_API_TOKEN) {
    return { ok: true, dryRun: true, hulyProjectId, members };
  }
  return hulyFetch(`/api/v1/projects/${hulyProjectId}/members`, {
    method: "POST",
    body: { members },
  });
}
