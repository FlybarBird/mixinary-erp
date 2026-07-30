import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateLinePricing, sumPricing } from "./pricing";

describe("domain calculateLinePricing", () => {
  it("matches sheet-equivalent sale math", () => {
    const line = calculateLinePricing({
      qty: 2,
      msrp: 100,
      quote: 90,
      overridePct: 0.1,
    });
    assert.equal(line.unitQuote, 90);
    assert.equal(line.unitSale, 100);
    assert.equal(line.totalSale, 200);
    assert.equal(line.outOfPocket, 20);
  });

  it("sums lines", () => {
    const total = sumPricing([
      calculateLinePricing({ qty: 1, msrp: 100, quote: 90, overridePct: 0 }),
      calculateLinePricing({ qty: 2, msrp: 10, quote: 8, overridePct: 0.1 }),
    ]);
    assert.equal(total.totalQuote, 106);
  });
});
