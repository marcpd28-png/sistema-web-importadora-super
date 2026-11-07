import assert from "node:assert/strict";
import test from "node:test";
import { validateQuoteFulfillment } from "./quote-checkout-intent";

test("accepts each fulfillment option with its correct address requirement", () => {
  assert.equal(validateQuoteFulfillment("DELIVERY", "Av. Lima 123"), null);
  assert.equal(validateQuoteFulfillment("PICKUP", null), null);
  assert.equal(validateQuoteFulfillment("PROVINCE", "Arequipa"), null);
  assert.match(validateQuoteFulfillment("DELIVERY", null) ?? "", /dirección/i);
  assert.match(validateQuoteFulfillment("UNKNOWN", "x") ?? "", /cómo recibirás/i);
});
