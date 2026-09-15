import test from "node:test";
import assert from "node:assert/strict";
import { isBotWallHtml } from "./fetch-html";
import { extractNextDataProducts } from "./next-data-products";

test("detects PerimeterX captcha pages", () => {
  const html = `<!DOCTYPE html><html><head>
    <meta name="description" content="px-captcha">
    <title>Access to this page has been denied</title>
  </head><body>/* PerimeterX assignments */ Press & Hold to confirm you are</body></html>`;
  assert.equal(isBotWallHtml(html, 403), true);
});

test("extracts Sweetwater __NEXT_DATA__ search hits", () => {
  const payload = {
    props: {
      pageProps: {
        resultsState: {
          results: [
            {
              hits: [
                {
                  productName: "MP-M40 Four Zone Mixer",
                  brand: "QSC",
                  objectID: "MP-M40",
                  url: "/store/detail/MP-M40--qsc-mp-m40-four-zone-mixer",
                  longDescription: "Zone Mixer with 4 mic/line inputs",
                  price: {
                    retailPrice: 1190,
                    catalogPrice: 1190,
                    finalPrice: 1190,
                  },
                  image_meta: {
                    pathAbsolute:
                      "https://media.sweetwater.com/m/products/image/example.jpg",
                  },
                  _highlightResult: { sku: { value: "684284070791" } },
                },
              ],
            },
          ],
        },
      },
    },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></html>`;
  const parts = extractNextDataProducts(
    html,
    "https://www.sweetwater.com/store/search?s=qsc+mp",
  );
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.sku, "MP-M40");
  assert.equal(parts[0]?.msrp, 1190);
  assert.equal(parts[0]?.brand, "QSC");
  assert.match(parts[0]?.name || "", /QSC.*MP-M40/);
  assert.match(
    parts[0]?.product_url || "",
    /\/store\/detail\/MP-M40--qsc-mp-m40-four-zone-mixer$/,
  );
  assert.equal(parts[0]?.upc, "684284070791");
  assert.equal(parts[0]?.source, "Sweetwater");
});
