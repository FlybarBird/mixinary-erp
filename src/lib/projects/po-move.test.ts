import test from "node:test";
import assert from "node:assert/strict";
import { resolveMoveQty } from "./po-move";

test("resolveMoveQty defaults to full quantity", () => {
  assert.equal(resolveMoveQty(10), 10);
  assert.equal(resolveMoveQty(10, null), 10);
  assert.equal(resolveMoveQty(10, undefined), 10);
});

test("resolveMoveQty accepts partial split", () => {
  assert.equal(resolveMoveQty(10, 4), 4);
  assert.equal(resolveMoveQty(10, 10), 10);
});

test("resolveMoveQty rejects invalid quantities", () => {
  assert.throws(() => resolveMoveQty(0), /no quantity/i);
  assert.throws(() => resolveMoveQty(10, 0), /Invalid quantity/i);
  assert.throws(() => resolveMoveQty(10, 11), /Invalid quantity/i);
  assert.throws(() => resolveMoveQty(10, Number.NaN), /Invalid quantity/i);
});
