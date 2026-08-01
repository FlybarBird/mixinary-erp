import test from "node:test";
import assert from "node:assert/strict";
import {
  getPoStatusVisual,
  mapPoStatusToItemStatus,
  normalizePoStatusKey,
} from "./procurement";

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

test("normalizePoStatusKey handles casing, spaces, and hyphens", () => {
  assert.equal(normalizePoStatusKey("In Procurement"), "in_procurement");
  assert.equal(normalizePoStatusKey("ON-SITE"), "on_site");
  assert.equal(normalizePoStatusKey(" Partially Received "), "partially_received");
  assert.equal(normalizePoStatusKey(null), "");
});

test("getPoStatusVisual maps In Procurement synonyms", () => {
  for (const status of [
    "partially_ordered",
    "in_procurement",
    "In Procurement",
    "draft",
    "ready_to_order",
  ]) {
    const v = getPoStatusVisual(status);
    assert.equal(v.key, "in_procurement", status);
    assert.equal(v.label, "In Procurement");
    assert.equal(v.rowClass, "status-row--in-procurement");
    assert.match(v.badgeClass, /badge-po-status-in-procurement/);
    assert.equal(v.ariaLabel, "Line item, status In Procurement");
  }
});

test("getPoStatusVisual treats not_ordered as neutral (not yet in procurement)", () => {
  for (const status of ["not_ordered", "Not Ordered"]) {
    const v = getPoStatusVisual(status);
    assert.equal(v.key, "neutral", status);
    assert.equal(v.label, "Not Ordered");
    assert.equal(v.rowClass, "status-row--neutral");
    assert.match(v.badgeClass, /badge-po-status-neutral/);
  }
});

test("getPoStatusVisual maps Ordered synonyms", () => {
  for (const status of ["ordered", "Ordered", "confirmed", "preparing"]) {
    const v = getPoStatusVisual(status);
    assert.equal(v.key, "ordered", status);
    assert.equal(v.label, "Ordered");
    assert.equal(v.rowClass, "status-row--ordered");
  }
});

test("getPoStatusVisual maps Received synonyms", () => {
  for (const status of [
    "received",
    "Received",
    "partially_received",
    "Partially Received",
  ]) {
    const v = getPoStatusVisual(status);
    assert.equal(v.key, "received", status);
    assert.equal(v.label, "Received");
    assert.equal(v.rowClass, "status-row--received");
  }
});

test("getPoStatusVisual maps On-site synonyms", () => {
  for (const status of ["on_site", "on-site", "On-site", "onsite", "ON SITE"]) {
    const v = getPoStatusVisual(status);
    assert.equal(v.key, "on_site", status);
    assert.equal(v.label, "On-site");
    assert.equal(v.rowClass, "status-row--on-site");
    assert.match(v.badgeClass, /badge-po-status-on-site/);
  }
});

test("getPoStatusVisual uses neutral styling for unknown statuses", () => {
  const v = getPoStatusVisual("backordered");
  assert.equal(v.key, "neutral");
  assert.equal(v.label, "Backordered");
  assert.equal(v.rowClass, "status-row--neutral");
  assert.match(v.badgeClass, /badge-po-status-neutral/);
  assert.equal(v.ariaLabel, "Line item, status Backordered");
});
