import assert from "node:assert/strict";
import test from "node:test";
import { documentFilename } from "./document-filename";

test("catalogs have a readable category filename without the cache hash", () => {
  assert.equal(documentFilename("/uploads/catalogs/catalogo-drones-f89a7bf050824e78.pdf"), "Catálogo de drones.pdf");
  assert.equal(documentFilename("/uploads/catalogs/catalogo-power-banks-0123456789abcdef.pdf?v=2"), "Catálogo de power banks.pdf");
});
test("ordinary documents retain their own filename", () => {
  assert.equal(documentFilename("/uploads/documents/Lista%20de%20precios.pdf"), "Lista de precios.pdf");
  assert.equal(documentFilename("https://api.ycloud.com/v2/media/opaque-id"), "Documento adjunto");
  assert.equal(documentFilename("/broken%xx.pdf"), "Documento adjunto");
});
