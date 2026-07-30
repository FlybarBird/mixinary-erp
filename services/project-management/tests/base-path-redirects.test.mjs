
import test from "node:test";
import assert from "node:assert/strict";

/**
 * Pure helpers mirroring company base-path redirect rules.
 * Fail if Plane would send users to ERP root `/`.
 */
function withBasePath(base, path) {
  const b = base.replace(/\/$/, "") || "";
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!b) return p;
  if (p === b || p.startsWith(`${b}/`)) return p;
  return `${b}${p}`;
}

function loginRedirect(base, next) {
  return withBasePath(base, `/auth/sign-in?next=${encodeURIComponent(withBasePath(base, next))}`);
}

function logoutRedirect(base) {
  return withBasePath(base, "/");
}

function oidcCallback(base) {
  return withBasePath(base, "/auth/oidc/callback");
}

function assertNotErpRoot(url) {
  assert.notEqual(url, "/");
  assert.notEqual(url, "https://example.com/");
  assert.ok(!url.match(/^https?:\/\/[^/]+\/?$/), `accidental ERP root: ${url}`);
}

const BASE = "/project-management";

test("login redirect stays under base path", () => {
  const url = loginRedirect(BASE, "/projects/abc");
  assert.match(url, /^\/project-management\//);
  assertNotErpRoot(url);
});

test("logout redirect is not ERP root", () => {
  const url = logoutRedirect(BASE);
  assert.equal(url, "/project-management/");
  assertNotErpRoot(url);
});

test("OIDC callback includes base path", () => {
  assert.equal(oidcCallback(BASE), "/project-management/auth/oidc/callback");
});

test("asset paths include base path", () => {
  assert.equal(withBasePath(BASE, "/_next/static/x.js"), "/project-management/_next/static/x.js");
});

test("websocket path includes base path", () => {
  assert.equal(withBasePath(BASE, "/ws/live"), "/project-management/ws/live");
});

test("notification link does not collapse to /", () => {
  const link = withBasePath(BASE, "/projects/p1/issues/i1");
  assertNotErpRoot(link);
  assert.equal(link, "/project-management/projects/p1/issues/i1");
});
