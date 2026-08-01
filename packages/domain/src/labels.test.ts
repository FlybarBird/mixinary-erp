import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLabelPrintRows, buildReceiveQrUrl } from "./labels";

describe("label rows", () => {
  it("builds one receive label per line", () => {
    const { rows, truncated } = buildLabelPrintRows(
      [
        { id: "a", description: "Mic", sku: "M1", qty_ordered: 3 },
        { id: "b", description: "Cable", sku: null, qty_ordered: 1 },
      ],
      "receive",
    );
    assert.equal(rows.length, 2);
    assert.equal(truncated, false);
    assert.equal(rows[0].qtyOrdered, 3);
  });

  it("expands item labels by qty", () => {
    const { rows } = buildLabelPrintRows(
      [{ id: "a", description: "Mic", sku: "M1", qty_ordered: 3 }],
      "item",
    );
    assert.equal(rows.length, 3);
    assert.equal(rows[2].pieceIndex, 3);
    assert.equal(rows[2].pieceTotal, 3);
  });

  it("builds receive QR URLs", () => {
    assert.equal(
      buildReceiveQrUrl({
        origin: "https://erp.example.com/",
        projectId: "p1",
        itemId: "i1",
      }),
      "https://erp.example.com/projects/p1/receive?item=i1",
    );
  });
});
