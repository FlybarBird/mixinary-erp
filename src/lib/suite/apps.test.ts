import test from "node:test";
import assert from "node:assert/strict";
import { getSuiteApps, projectManagementOpenUrl } from "./apps";
import {
  OPENPROJECT_SUITE_PATH,
  resolvePmBasePath,
  suitePmLauncherHref,
} from "./pm-base";

test("suite apps include PM under /project-management", () => {
  const apps = getSuiteApps();
  const pm = apps.find((a) => a.id === "pm");
  assert.ok(pm);
  assert.equal(pm?.href, "/project-management");
  assert.equal(pm?.external, true);
});

test("launcher href is always OpenProject suite path", () => {
  assert.equal(suitePmLauncherHref(), OPENPROJECT_SUITE_PATH);
  assert.equal(getSuiteApps().find((a) => a.id === "pm")?.href, "/project-management");
});

test("open URL does not collapse to ERP root", () => {
  const url = projectManagementOpenUrl("op-1");
  assert.equal(url, "/project-management/projects/op-1");
  assert.notEqual(url, "/");
});

test("PM app describes OpenProject", () => {
  const pm = getSuiteApps().find((a) => a.id === "pm");
  assert.match(pm?.description || "", /OpenProject/i);
});

test("ignores legacy Plane host from env", () => {
  assert.equal(
    resolvePmBasePath("https://plane-mixinary.shadowvis.com/"),
    "/project-management",
  );
  assert.equal(
    resolvePmBasePath("https://plane-mixinary.shadowvis.com"),
    "/project-management",
  );
  assert.equal(
    resolvePmBasePath("https://plane.example.com/app"),
    "/project-management",
  );
});

test("keeps same-origin OpenProject path", () => {
  assert.equal(resolvePmBasePath("/project-management"), "/project-management");
  assert.equal(resolvePmBasePath("/project-management/"), "/project-management");
});

test("keeps non-Plane absolute OpenProject URL for deep links", () => {
  assert.equal(
    resolvePmBasePath("https://erp.example.com/project-management"),
    "https://erp.example.com/project-management",
  );
});
