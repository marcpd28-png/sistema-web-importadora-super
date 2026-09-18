import assert from "node:assert/strict";
import test from "node:test";
import { checkoutOwnsReply } from "./bc-checkout-routing";

test("quantity replies stay in checkout while independent questions keep their agenda", () => {
  for (const stage of ["AWAITING_QUANTITY", "AWAITING_PRICE_CONFIRMATION"]) {
    for (const content of ["2", "2 unidades", "mejor 3", "2?", "si"]) assert.equal(checkoutOwnsReply(stage, content), true, `${stage}: ${content}`);
    for (const content of ["precio N1321", "¿Cuánto cuesta el envío?", "información de audífonos JBL"]) assert.equal(checkoutOwnsReply(stage, content), false, content);
  }
  assert.equal(checkoutOwnsReply("AWAITING_PRODUCT_QUERY", "2"), false);
  assert.equal(checkoutOwnsReply(undefined, "2"), false);
  assert.equal(checkoutOwnsReply("AWAITING_ORDER_CONFIRMATION", "mejor 3"), true);
});
