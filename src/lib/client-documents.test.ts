import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCustomerSelections,
  computeDocumentTotals,
  computePricingTotals,
  groupPricingLines,
  normalizePricingContent,
  removePricingLine,
  type DocBlockSnapshot,
} from "./client-documents";

function line(partial: Record<string, unknown>) {
  return {
    qty: 1,
    unit_price: 0,
    optional: false,
    selected: true,
    ...partial,
  };
}

describe("pricing tables and sub-items", () => {
  it("keeps a required table and required line in the total", () => {
    const totals = computePricingTotals({
      lines: [line({ id: "a", name: "Install", unit_price: 1250 })],
    });
    assert.equal(totals.total, 1250);
  });

  it("drops an optional line that is not selected", () => {
    const totals = computePricingTotals({
      lines: [
        line({ id: "a", name: "Install", unit_price: 1000 }),
        line({
          id: "b",
          name: "Training",
          unit_price: 200,
          optional: true,
          selected: false,
        }),
      ],
    });
    assert.equal(totals.subtotal, 1000);
    assert.equal(totals.total, 1000);
  });

  it("zeros an optional table that is not included, including discount and tax", () => {
    const totals = computePricingTotals({
      optional: true,
      selected: false,
      lines: [line({ id: "a", name: "Install", unit_price: 1000 })],
      discount: { type: "percent", value: 10 },
      tax: { type: "percent", value: 8, label: "Tax" },
    });
    assert.deepEqual(totals, {
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      total: 0,
    });
  });

  it("includes an optional table when it is selected", () => {
    const totals = computePricingTotals({
      optional: true,
      selected: true,
      lines: [line({ id: "a", name: "Install", unit_price: 400 })],
      tax: { type: "amount", value: 25, label: "Tax" },
    });
    assert.equal(totals.subtotal, 400);
    assert.equal(totals.tax_total, 25);
    assert.equal(totals.total, 425);
  });

  it("excludes sub-items when the parent optional line is off", () => {
    const totals = computePricingTotals({
      lines: [
        line({
          id: "parent",
          name: "Rack",
          unit_price: 500,
          optional: true,
          selected: false,
        }),
        line({ id: "child", name: "Shelf", unit_price: 80, parent_id: "parent" }),
        line({ id: "other", name: "Cable", unit_price: 20 }),
      ],
    });
    assert.equal(totals.total, 20);
  });

  it("includes sub-items when the parent is included", () => {
    const totals = computePricingTotals({
      lines: [
        line({
          id: "parent",
          name: "Rack",
          unit_price: 500,
          optional: true,
          selected: true,
        }),
        line({
          id: "child",
          name: "Shelf",
          unit_price: 80,
          parent_id: "parent",
          optional: true,
          selected: false,
        }),
      ],
    });
    assert.equal(totals.total, 580);
  });

  it("treats an orphan parent id as a top-level line", () => {
    const pricing = normalizePricingContent({
      lines: [
        line({
          id: "orphan",
          name: "Loose",
          unit_price: 15,
          parent_id: "missing",
          optional: true,
          selected: false,
        }),
      ],
    });
    assert.equal(pricing.lines[0]?.parent_id, null);
    assert.equal(pricing.lines[0]?.optional, true);
    assert.equal(computePricingTotals(pricing).total, 0);
  });

  it("keeps nesting to one level", () => {
    const pricing = normalizePricingContent({
      lines: [
        line({ id: "a", name: "A", unit_price: 10 }),
        line({ id: "b", name: "B", unit_price: 5, parent_id: "a" }),
        line({
          id: "c",
          name: "C",
          unit_price: 3,
          parent_id: "b",
          optional: true,
          selected: false,
        }),
      ],
    });
    assert.equal(pricing.lines.find((l) => l.id === "b")?.parent_id, "a");
    assert.equal(pricing.lines.find((l) => l.id === "b")?.optional, false);
    assert.equal(pricing.lines.find((l) => l.id === "c")?.parent_id, null);
    const groups = groupPricingLines(pricing.lines);
    assert.deepEqual(
      groups.map((group) => [group.line.id, group.children.map((child) => child.id)]),
      [
        ["a", ["b"]],
        ["c", []],
      ],
    );
    assert.equal(computePricingTotals(pricing).total, 15);
  });

  it("removes a parent together with its sub-items", () => {
    const lines = normalizePricingContent({
      lines: [
        line({ id: "a", name: "A" }),
        line({ id: "b", name: "B", parent_id: "a" }),
        line({ id: "c", name: "C" }),
      ],
    }).lines;
    assert.deepEqual(
      removePricingLine(lines, "a").map((l) => l.id),
      ["c"],
    );
  });

  it("applies section and line selections, and ignores sub-item toggles", () => {
    const blocks: DocBlockSnapshot[] = [
      {
        id: "block",
        block_type: "pricing",
        sort_order: 0,
        hidden: false,
        content: {
          optional: true,
          selected: true,
          lines: [
            line({
              id: "parent",
              name: "Rack",
              unit_price: 100,
              optional: true,
              selected: true,
            }),
            line({ id: "child", name: "Shelf", unit_price: 40, parent_id: "parent" }),
          ],
          discount: { type: "none", value: 0 },
          tax: { type: "none", value: 0 },
        },
      },
    ];

    const childIgnored = applyCustomerSelections(blocks, [
      { block_id: "block", line_id: "child", selected: false },
    ]);
    assert.equal(computePricingTotals(childIgnored[0]!.content).total, 140);

    const parentOff = applyCustomerSelections(blocks, [
      { block_id: "block", line_id: "parent", selected: false },
    ]);
    assert.equal(computePricingTotals(parentOff[0]!.content).total, 0);

    const sectionOff = applyCustomerSelections(blocks, [
      { block_id: "block", section_selected: false },
    ]);
    assert.equal(computePricingTotals(sectionOff[0]!.content).total, 0);

    const required = applyCustomerSelections(
      [
        {
          ...blocks[0]!,
          content: { ...blocks[0]!.content, optional: false, selected: true },
        },
      ],
      [{ block_id: "block", section_selected: false }],
    );
    assert.equal(computePricingTotals(required[0]!.content).total, 140);
  });

  it("leaves an excluded optional table out of the document total", () => {
    const totals = computeDocumentTotals([
      {
        block_type: "pricing",
        hidden: false,
        content: {
          optional: true,
          selected: false,
          lines: [line({ id: "a", name: "Option", unit_price: 900 })],
        },
      },
      {
        block_type: "pricing",
        hidden: false,
        content: {
          lines: [line({ id: "b", name: "Base", unit_price: 100 })],
        },
      },
      {
        block_type: "quote_total",
        hidden: false,
        content: { label: "Quote" },
      },
    ]);
    assert.equal(totals.total, 100);
  });
});
