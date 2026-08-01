import test from "node:test";
import assert from "node:assert/strict";
import { getSuiteApps, projectManagementOpenUrl } from "./apps";

test("suite apps include PM under /project-management", () => {
  const apps = getSuiteApps();
  const pm = apps.find((a) => a.id === "pm");
  assert.ok(pm);
  assert.equal(pm?.href, "/project-management");
  assert.equal(pm?.external, true);
});

test("open URL does not collapse to ERP root", () => {
  const url = projectManagementOpenUrl("plane-1");
  assert.equal(url, "/project-management/projects/plane-1");
  assert.notEqual(url, "/");
});
