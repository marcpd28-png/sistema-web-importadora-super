import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveryLocation, isPriceFollowUp, isRockyGreeting, requestedUnits, verifiedQuote, isQuantityOnly } from "./rocky-conversation-policy";

test("greetings and spelling variants stay greetings", () => {
  for (const value of ["Ola", "Hola!", "Buenas tatdes", "Buen día", "Hola\nBuenos días", "Hola buenas tardes", "Ola buen día", "Muy buenos días"]) assert.equal(isRockyGreeting(value), true);
  assert.equal(isRockyGreeting("Hola precio del televisor"), false);
});
test("model numbers are not quantities and questions are not addresses", () => {
  assert.equal(requestedUnits("iPhone 15 precio"), null);
  assert.equal(requestedUnits("quiero 3 unidades"), 3);
  assert.equal(isQuantityOnly("iphone 15, 3 unidades"), false);
  assert.equal(deliveryLocation("¿Dónde están ubicados?"), null);
  assert.equal(deliveryLocation("Precio del televisor"), null);
  assert.equal(deliveryLocation("Arequipa"), "Arequipa");
  assert.equal(deliveryLocation("Av. Abancay 752"), "Av. Abancay 752");
  assert.equal(isPriceFollowUp("Y cuánto cuesta?"), true);
});
test("fresh quote applies current wholesale tier and checks stock", () => {
  const product = { isVisible: true, stockUnits: 10, unitPrice: 100, wholesalePrice: 90, wholesaleMinQty: 3 };
  assert.deepEqual(verifiedQuote(product, 3), { quantity: 3, unitPrice: 90, total: 270 });
  assert.equal(verifiedQuote(product, 11), null);
  assert.equal(verifiedQuote({ ...product, unitPrice: 0 }, 1), null);
  assert.equal(verifiedQuote({ ...product, isVisible: false }, 1), null);
});
