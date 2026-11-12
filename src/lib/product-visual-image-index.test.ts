import assert from "node:assert/strict";
import test from "node:test";
import {
  createVisualImageHash,
  rankVisualImageMatches,
  visualImageHashDistance,
} from "./product-visual-image-index";

const stripedImage = Buffer.from(`
  <svg width="90" height="40" xmlns="http://www.w3.org/2000/svg">
    <rect width="90" height="40" fill="white" />
    <rect width="45" height="40" fill="black" />
  </svg>
`);

test("la huella visual es estable y ocupa 64 bits", async () => {
  const first = await createVisualImageHash(stripedImage);
  const second = await createVisualImageHash(Buffer.from(stripedImage));

  assert.match(first, /^[a-f0-9]{16}$/);
  assert.equal(first, second);
  assert.equal(visualImageHashDistance(first, second), 0);
  assert.equal(visualImageHashDistance("0000000000000000", "ffffffffffffffff"), 64);
});

test("ordena todas las imágenes indexadas por distancia visual", () => {
  const ranked = rankVisualImageMatches("0000000000000000", [
    { id: "far", imageVisualHash: "ffffffffffffffff" },
    { id: "near", imageVisualHash: "0000000000000003" },
    { id: "exact", imageVisualHash: "0000000000000000" },
    { id: "missing", imageVisualHash: null },
  ]);

  assert.deepEqual(ranked.map(({ record, distance }) => [record.id, distance]), [
    ["exact", 0],
    ["near", 2],
    ["far", 64],
  ]);
});
