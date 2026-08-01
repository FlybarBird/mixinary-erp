
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

test("secure link signature format", () => {
  const secret = "s";
  const id = "abc";
  const exp = 123;
  const sig = crypto.createHmac("sha256", secret).update(`${id}:${exp}`).digest("hex");
  assert.equal(sig.length, 64);
});
