import test from "node:test";
import assert from "node:assert/strict";
import { getSuiteApps } from "./apps";

test("suite apps do not include project management", () => {
  const ids = getSuiteApps().map((a) => a.id);
  assert.equal(ids.includes("pm" as never), false);
  assert.deepEqual(ids, ["landing", "erp", "client-documents", "admin"]);
  for (const app of getSuiteApps()) {
    assert.equal(app.href.includes("project-management"), false);
    assert.equal(/plane/i.test(app.href), false);
  }
});
