import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("compose pins OpenProject and relative URL root", () => {
  const yml = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
  assert.match(yml, /openproject\/openproject/);
  assert.match(yml, /OPENPROJECT_RAILS__RELATIVE__URL__ROOT/);
  assert.match(yml, /APP_BASE_PATH:-\/project-management/);
  assert.doesNotMatch(yml, /hardcoreeng|huly/i);
});

test("compose keeps Community password login enabled", () => {
  const yml = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
  assert.match(yml, /OPENPROJECT_DISABLE__PASSWORD__LOGIN/);
  assert.match(yml, /OPENPROJECT_SEED__ADMIN__USER__PASSWORD/);
  assert.match(yml, /OPENPROJECT_SEED__ADMIN__USER__LOCKED/);
  assert.match(yml, /project-management\/login/);
  assert.match(yml, /OPENPROJECT_CACHE__MEMCACHE__SERVER/);
});

test("env example documents admin seed + suite path", () => {
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(env, /OPENPROJECT_SEED__ADMIN__USER__PASSWORD=admin/);
  assert.match(env, /OPENPROJECT_DISABLE__PASSWORD__LOGIN=false/);
  assert.match(env, /APP_BASE_PATH=\/project-management/);
});

test("login docs and smoke script exist", () => {
  assert.ok(fs.existsSync(path.join(root, "docs/LOGIN.md")));
  assert.ok(fs.existsSync(path.join(root, "scripts/smoke-login.sh")));
  const script = fs.readFileSync(path.join(root, "scripts/smoke-login.sh"), "utf8");
  assert.match(script, /project-management\/login|BASE_PATH.*login/);
});

test("version pin file exists", () => {
  const v = fs.readFileSync(path.join(root, "OPENPROJECT_VERSION"), "utf8").trim();
  assert.ok(v.length > 0);
});
