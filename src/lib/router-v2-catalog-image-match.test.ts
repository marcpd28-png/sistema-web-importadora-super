import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { catalogImageContentHash, matchCatalogSourceImage } from "./router-v2-catalog-image-match";

const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT5sAAAAASUVORK5CYII=", "base64");
const image = `data:image/png;base64,${bytes.toString("base64")}`;

test("a unique exact source-photo match supplies a catalog code without provider calls", async () => {
  const match = await matchCatalogSourceImage(image, async hash => {
    assert.equal(hash, createHash("sha256").update(bytes).digest("hex"));
    return [{ code: "A1" }];
  });
  assert.equal(match?.hints.code, "A1");
  assert.equal(match?.model, "catalog-source-image-sha256");
});

test("shared photos and unknown images never choose an arbitrary product", async () => {
  assert.equal(await matchCatalogSourceImage(image, async () => [{ code: "A1" }, { code: "A2" }]), null);
  assert.equal(await matchCatalogSourceImage(image, async () => []), null);
});

test("remote URLs, malformed input and oversize images do not cause a catalog scan or download", async () => {
  for (const value of ["http://127.0.0.1/private.png", "https://example.com/a.png", "data:image/png;base64,aGVsbG8=", "data:image/png;base64,abc", "data:image/png;base64," + "A".repeat(6_000_000)]) {
    assert.equal(catalogImageContentHash(value), null);
    assert.equal(await matchCatalogSourceImage(value, async () => { throw Error("unexpected query"); }), null);
  }
});
