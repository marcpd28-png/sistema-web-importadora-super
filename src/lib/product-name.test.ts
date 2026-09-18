import assert from "node:assert/strict";
import { test } from "node:test";
import { getPublicProductName } from "./product-name";

test("conserva el modelo y elimina el código interno inicial", () => {
  assert.equal(getPublicProductName("(00321) Parlante (KTS-1756)"), "Parlante KTS-1756");
  assert.equal(getPublicProductName("Audífonos cod. (P9)"), "Audífonos P9");
});

test("limpia los saltos del catálogo y conserva los nombres sin código", () => {
  assert.equal(getPublicProductName("  Cargador_x000D_ USB  20W  "), "Cargador USB 20W");
  assert.equal(getPublicProductName("Cable USB-C"), "Cable USB-C");
  assert.equal(getPublicProductName("(A12)"), "(A12)");
});
