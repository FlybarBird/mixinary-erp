/**
 * OpenProject APIv3 client — never touches OpenProject DB directly.
 * Auth: HTTP Basic with username `apikey` and password = API access token.
 * @see https://www.openproject.org/docs/api/introduction/
 */

function apiBase() {
  return (
    process.env.OPENPROJECT_API_BASE_URL ||
    process.env.HULY_API_BASE_URL ||
    process.env.PLANE_API_BASE_URL ||
    ""
  ).replace(/\/$/, "");
}

function apiKey() {
  return (
    process.env.OPENPROJECT_API_KEY ||
    process.env.HULY_API_TOKEN ||
    process.env.PLANE_API_TOKEN ||
    ""
  );
}

function dryRun() {
  return (
    process.env.OPENPROJECT_DRY_RUN === "1" ||
    process.env.HULY_DRY_RUN === "1" ||
    process.env.PLANE_DRY_RUN === "1" ||
    !apiKey()
  );
}

function basicAuthHeader(key) {
  const token = Buffer.from(`apikey:${key}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

/** Slug suitable for OpenProject project identifier (lowercase, [a-z0-9_-]). */
export function toProjectIdentifier(name, fallback = "project") {
  const slug = String(name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || fallback;
}

export async function openProjectFetch(path, { method = "GET", body } = {}) {
  const base = apiBase();
  const key = apiKey();
  const urlPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/hal+json, application/json",
      ...(key ? { authorization: basicAuthHeader(key) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`OpenProject API ${method} ${urlPath} failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Create an OpenProject project.
 * Returns { id, identifier, name, dryRun? }.
 */
export async function createOpenProjectProject({
  name,
  identifier,
  templateSlug,
}) {
  const idSlug = identifier || toProjectIdentifier(name);
  if (dryRun()) {
    return {
      id: `dry-op-${Buffer.from(name).toString("hex").slice(0, 12)}`,
      identifier: idSlug,
      name,
      templateSlug,
      dryRun: true,
    };
  }

  const payload = {
    name,
    identifier: idSlug,
    public: false,
    active: true,
  };
  // Optional custom field / description hint for Mixinary template.
  if (templateSlug) {
    payload.description = {
      format: "plain",
      raw: `Mixinary template: ${templateSlug}`,
    };
  }

  const data = await openProjectFetch("/api/v3/projects", {
    method: "POST",
    body: payload,
  });
  return {
    id: String(data.id),
    identifier: data.identifier || idSlug,
    name: data.name || name,
  };
}

/**
 * Add memberships to a project.
 * `members` items: { userId | href, roleId? } — role defaults to OPENPROJECT_DEFAULT_ROLE_ID.
 */
export async function addOpenProjectMembers(projectId, members) {
  if (dryRun()) {
    return { ok: true, dryRun: true, projectId, members };
  }
  const defaultRole =
    process.env.OPENPROJECT_DEFAULT_ROLE_ID || "3"; // Member in stock OP
  const results = [];
  for (const m of members || []) {
    const userHref =
      m.href ||
      (m.userId ? `/api/v3/users/${m.userId}` : null) ||
      (m.pmUserId ? `/api/v3/users/${m.pmUserId}` : null);
    if (!userHref) continue;
    const roleId = m.roleId || defaultRole;
    const data = await openProjectFetch("/api/v3/memberships", {
      method: "POST",
      body: {
        _links: {
          project: { href: `/api/v3/projects/${projectId}` },
          principal: { href: userHref },
          roles: [{ href: `/api/v3/roles/${roleId}` }],
        },
      },
    });
    results.push(data);
  }
  return { ok: true, results };
}
