import test from "node:test";
import assert from "node:assert/strict";
import {
  createDuplicateIndex,
  proposalIdentityKey,
  productIdentityUrl,
} from "./find-duplicate";

const listing = "https://www.sweetwater.com/store/detail/search?s=mixer";

test("shared listing URL is not a device identity", () => {
  assert.equal(productIdentityUrl(listing, [listing]), null);
  assert.equal(
    productIdentityUrl("https://www.sweetwater.com/store/detail/SM58", [listing]),
    "https://www.sweetwater.com/store/detail/SM58",
  );
});

test("devices that only share a listing page are not the same", () => {
  const a = proposalIdentityKey(
    { name: "SM58", sku: null, product_url: listing },
    [listing],
  );
  const b = proposalIdentityKey(
    { name: "SM57", sku: null, product_url: listing },
    [listing],
  );
  assert.notEqual(a, b);
});

test("same SKU on a different device is not a catalog duplicate", () => {
  const index = createDuplicateIndex([
    {
      id: "p1",
      name: "Existing Amp",
      sku: "1001",
      upc: null,
      company_id: "co-a",
      specs: null,
    },
  ]);
  assert.equal(
    index.find({
      sku: "1001",
      name: "New Speaker",
      company_id: "co-b",
    }),
    null,
  );
});

test("same SKU and company is a duplicate", () => {
  const index = createDuplicateIndex([
    {
      id: "p1",
      name: "SM58",
      sku: "SM58-LC",
      upc: null,
      company_id: "shure",
      specs: null,
    },
  ]);
  const hit = index.find({
    sku: "SM58-LC",
    name: "SM58 Dynamic",
    company_id: "shure",
  });
  assert.equal(hit?.reason, "sku");
  assert.equal(hit?.id, "p1");
});

test("listing URL stored on an older part does not block new devices", () => {
  const index = createDuplicateIndex([
    {
      id: "p1",
      name: "First mixer",
      sku: null,
      upc: null,
      company_id: null,
      specs: { scraped_from: listing },
      product_url: listing,
    },
  ]);
  assert.equal(
    index.find({
      name: "Second mixer",
      product_url: listing,
    }),
    null,
  );
});
