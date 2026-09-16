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

test("version pin file exists", () => {
  const v = fs.readFileSync(path.join(root, "OPENPROJECT_VERSION"), "utf8").trim();
  assert.ok(v.length > 0);
});
