import assert from "node:assert/strict";
import test from "node:test";

import { calculateRouterV2CommercialPrice } from "@/lib/router-v2-commercial-price";

const product = {
  brand: "SUPER",
  category: "Accesorios",
  code: "A100",
  name: "Producto de prueba",
  stockUnits: 5,
  unitPrice: 20,
  wholesaleMinQty: 3,
  wholesalePrice: 15,
};

test("does not quote a quantity greater than current stock", () => {
  assert.deepEqual(calculateRouterV2CommercialPrice(product, 6), {
    status: "INSUFFICIENT_STOCK",
    productCode: "A100",
    quantity: 6,
  });
});

test("quotes exact available quantity and applies the correct tier", () => {
  const result = calculateRouterV2CommercialPrice(product, 5);

  assert.equal(result.status, "READY");
  if (result.status !== "READY") return;

  assert.equal(result.priceTier, "MAYORISTA");
  assert.equal(result.unitPrice, 15);
  assert.equal(result.total, 75);
});
