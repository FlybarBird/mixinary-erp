
import test from "node:test";
import assert from "node:assert/strict";

function withBasePath(base, path) {
  const b = base.replace(/\/$/, "") || "";
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!b) return p;
  if (p === b || p.startsWith(`${b}/`)) return p;
  return `${b}${p}`;
}

function assertNotErpRoot(url) {
  assert.notEqual(url, "/");
  assert.ok(!url.match(/^https?:\/\/[^/]+\/?$/), `accidental ERP root: ${url}`);
}

const BASE = "/project-management";

test("login stays under base path", () => {
  const url = withBasePath(BASE, "/login");
  assert.equal(url, "/project-management/login");
  assertNotErpRoot(url);
});

test("logout is not ERP root", () => {
  assert.equal(withBasePath(BASE, "/"), "/project-management/");
});

test("OIDC account callback path does not collapse to /", () => {
  const url = "/_accounts/auth/openid/callback";
  assertNotErpRoot(url);
});

test("notification deep link keeps PM prefix", () => {
  assert.equal(
    withBasePath(BASE, "/workbench/issues/i1"),
    "/project-management/workbench/issues/i1",
  );
});
