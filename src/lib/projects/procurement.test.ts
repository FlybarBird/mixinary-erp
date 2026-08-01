import test from "node:test";
import assert from "node:assert/strict";
import { mapPoStatusToItemStatus } from "./procurement";

test("mapPoStatusToItemStatus cascades ordered", () => {
  assert.equal(mapPoStatusToItemStatus("ordered"), "ordered");
  assert.equal(mapPoStatusToItemStatus("confirmed"), "confirmed");
  assert.equal(mapPoStatusToItemStatus("cancelled"), "cancelled");
  assert.equal(mapPoStatusToItemStatus("draft"), "not_ordered");
});

test("mapPoStatusToItemStatus skips aggregate PO statuses", () => {
  assert.equal(mapPoStatusToItemStatus("partially_shipped"), null);
  assert.equal(mapPoStatusToItemStatus("partially_received"), null);
  assert.equal(mapPoStatusToItemStatus("on_hold"), null);
  assert.equal(mapPoStatusToItemStatus("closed"), null);
});
