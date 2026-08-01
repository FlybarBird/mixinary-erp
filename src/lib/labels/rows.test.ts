import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLabelPrintRows,
  buildReceiveQrUrl,
  normalizeLabelPrinterBrand,
} from "./rows";

test("normalizeLabelPrinterBrand defaults to dymo", () => {
  assert.equal(normalizeLabelPrinterBrand("dymo"), "dymo");
  assert.equal(normalizeLabelPrinterBrand("brother"), "brother");
  assert.equal(normalizeLabelPrinterBrand("other"), "dymo");
  assert.equal(normalizeLabelPrinterBrand(null), "dymo");
});

test("buildReceiveQrUrl strips trailing slash", () => {
  assert.equal(
    buildReceiveQrUrl({
      origin: "https://erp.example.com/",
      projectId: "p1",
      itemId: "i1",
    }),
    "https://erp.example.com/projects/p1/receive?item=i1",
  );
});

test("buildLabelPrintRows receive is one per line", () => {
  const { rows, truncated } = buildLabelPrintRows(
    [
      { id: "a", description: "A", sku: "S", qty_ordered: 3 },
      { id: "b", description: "B", sku: null, qty_ordered: 1 },
    ],
    "receive",
  );
  assert.equal(truncated, false);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.pieceIndex, null);
});

test("buildLabelPrintRows item expands qty", () => {
  const { rows } = buildLabelPrintRows(
    [{ id: "a", description: "A", sku: "S", qty_ordered: 3 }],
    "item",
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.pieceIndex),
    [1, 2, 3],
  );
});
