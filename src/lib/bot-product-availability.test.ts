import assert from "node:assert/strict";
import test from "node:test";
import { createCommercialCatalog, type CommercialProduct } from "./commercial-catalog";
import { answerProductRequest } from "./bc-request-answers";
import { emptyAgenda, planRequests } from "./bc-request-agenda";
import { getBotProductImageUrls } from "./bot-product-availability";

const product = (code: string, overrides = {}) => ({ id: code, code, name: `PARLANTE JBL ${code}`, brand: "JBL", category: "PARLANTES", isVisible: true, stockUnits: 10, imageUrl: "/uploads/products/photo.jpg", updatedAt: new Date(), unitPrice: 99, wholesalePrice: null, wholesaleMinQty: 6, specifications: [], ...overrides }) as unknown as CommercialProduct;

test("catalogs exclude hidden, exhausted, missing-photo, placeholder and video-only products", () => {
  const snapshot = createCommercialCatalog([
    product("OK"), product("HIDDEN", { isVisible: false }), product("EMPTY", { stockUnits: 0 }),
    product("NEGATIVE", { stockUnits: -1 }), product("MISSING", { imageUrl: null }),
    product("PLACEHOLDER", { localImageUrl: "/uploads/placeholder.jpg", imageUrl: "/sin-foto.png" }),
    product("VIDEO", { imageUrl: null, media: [{ type: "VIDEO", url: "/uploads/video.mp4" }] }),
    product("GALLERY", { imageUrl: null, media: [{ type: "IMAGE", url: "/uploads/gallery.jpg" }] }),
  ]);
  assert.deepEqual(snapshot.search("catálogo parlantes JBL").products.map(p => p.code).sort(), ["GALLERY", "OK"]);
  assert.equal(snapshot.search("EMPTY", false).products.length, 1);
  assert.equal(snapshot.search("HIDDEN", false).products.length, 0);
  assert.deepEqual(getBotProductImageUrls(product("X", { localImageUrl: " /uploads/placeholder.jpg ", sourceImageUrl: " /uploads/real.jpg " })), ["/uploads/real.jpg", "/uploads/products/photo.jpg"]);
});

test("specific unavailable products return only availability for search, information, price and stock", () => {
  for (const question of ["parlante JBL", "información parlante JBL", "precio parlante JBL", "stock parlante JBL"]) {
    for (const [overrides, expected] of [
      [{ stockUnits: 0 }, /actualmente se encuentra sin stock/],
      [{ imageUrl: null }, /no tiene una foto disponible/],
      [{ stockUnits: 0, imageUrl: null }, /sin stock.*Tampoco tiene una foto/],
    ] as const) {
      const { agenda } = planRequests(emptyAgenda(), [{ id: "m", content: question }]);
      const topic = agenda.topics[0]; topic.selectedCode = "OLD"; topic.shownCodes = ["OLD"];
      const answer = answerProductRequest(agenda.requests[0], topic, [product("INTERNAL-CODE", { ...overrides, specifications: [{ name: "Potencia", value: "999 W" }] })]);
      assert.match(answer.content, expected);
      assert.doesNotMatch(answer.content, /INTERNAL-CODE|99\.00|999 W|cotizar|comprar/);
      assert.equal(topic.selectedCode, null);
      assert.deepEqual(topic.shownCodes, []);
    }
  }
});

test("broad option lists never leak unavailable products or hidden inventory", () => {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "m", content: "parlantes JBL" }]);
  const answer = answerProductRequest(agenda.requests[0], agenda.topics[0], [product("OK1"), product("OK2"), product("EMPTY", { stockUnits: 0 }), product("MISSING", { imageUrl: null }), product("SECRET", { isVisible: false })]);
  assert.match(answer.content, /2 opciones/);
  assert.doesNotMatch(answer.content, /EMPTY|MISSING|SECRET/);
  const hidden = answerProductRequest(agenda.requests[0], agenda.topics[0], [product("SECRET", { isVisible: false })]);
  assert.doesNotMatch(hidden.content, /SECRET|99|sin stock/);
});

test("image request failures report no photo, while exhausted products still report no stock", () => {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "m", content: "parlante JBL" }]);
  assert.match(answerProductRequest(agenda.requests[0], agenda.topics[0], [product("X")], { photoUnavailable: true }).content, /no tiene una foto disponible/);
  const exhausted = answerProductRequest(agenda.requests[0], agenda.topics[0], [product("X", { stockUnits: 0 })], { photoUnavailable: true });
  assert.match(exhausted.content, /sin stock/);
  assert.doesNotMatch(exhausted.content, /foto/);
});
