import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateLinePricing, sumPricing } from "./pricing";

describe("calculateLinePricing", () => {
  it("matches sheet formulas with quote and override", () => {
    const line = calculateLinePricing({
      qty: 3,
      msrp: 100,
      quote: 80,
      overridePct: 0.1,
    });
    assert.equal(line.totalMsrp, 300);
    assert.equal(line.unitQuote, 80);
    assert.equal(line.totalQuote, 240);
    assert.equal(line.unitSale, 90);
    assert.equal(line.totalSale, 270);
    assert.equal(line.clientSavings, 30);
    assert.equal(line.outOfPocket, 30);
  });

  it("defaults quote to msrp and override to project default", () => {
    const line = calculateLinePricing({
      qty: 2,
      msrp: 50,
      projectDefaultOverridePct: 0.08,
    });
    assert.equal(line.unitQuote, 50);
    assert.equal(line.unitSale, 54);
    assert.equal(line.totalSale, 108);
    assert.equal(line.outOfPocket, 8);
  });

  it("sums project totals", () => {
    const totals = sumPricing([
      calculateLinePricing({ qty: 1, msrp: 100, quote: 90, overridePct: 0 }),
      calculateLinePricing({ qty: 2, msrp: 10, quote: 8, overridePct: 0.1 }),
    ]);
    assert.equal(totals.totalMsrp, 120);
    assert.equal(totals.totalQuote, 106);
    assert.equal(totals.totalSale, 108);
  });
});
