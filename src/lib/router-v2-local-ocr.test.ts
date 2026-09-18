import assert from "node:assert/strict";
import test from "node:test";
import { agreedOcrCode, codesFromOcrTsv, matchCatalogImageText } from "./router-v2-local-ocr";

const scan = (words: string[], confidence = 95) => "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n" +
  words.map((word, index) => `5\t1\t1\t1\t1\t${index + 1}\t0\t0\t50\t20\t${confidence}\t${word}`).join("\n");

test("local OCR needs an explicit label and matching, confident readings", () => {
  const good = scan(["CODIGO:", "N1321"]);
  assert.equal(agreedOcrCode([good, good]), "N1321");
  assert.deepEqual(codesFromOcrTsv(scan(["Precio", "N1321"])), []);
  assert.equal(agreedOcrCode([good, scan(["SKU:", "N1327"])]), null);
  assert.equal(agreedOcrCode([good, scan(["SKU:", "N1321"], 60)]), null);
  assert.equal(agreedOcrCode([good, scan(["SKU:", "N1321"], NaN)]), null);
  assert.equal(agreedOcrCode([good]), null);
  const ambiguous = scan(["SKU:", "N1321", "SKU:", "A123"]);
  assert.equal(agreedOcrCode([ambiguous, ambiguous]), null);
  const mistaken = scan(["SKU:", "N13O1"]);
  assert.equal(agreedOcrCode([mistaken, mistaken]), null);
});

test("local OCR does not download URLs or query catalog for malformed media", async () => {
  let calls = 0;
  for (const input of ["https://example.com/image.jpg", "data:image/png;base64,YWJjZA==", "data:audio/ogg;base64,YWJjZA=="]) {
    assert.equal(await matchCatalogImageText(input, async () => { calls++; return []; }), null);
  }
  assert.equal(calls, 0);
});
