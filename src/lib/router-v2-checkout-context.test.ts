import assert from "node:assert/strict";
import test from "node:test";
import { resolveRouterV2CheckoutFlow } from "./router-v2-checkout-flow";

test("checkout keeps customer context through document, delivery, confirmation and unverified receipt", () => {
  let state = { stage: "AWAITING_PRICE_CONFIRMATION" };
  const advance = (content: string, extra: Partial<Parameters<typeof resolveRouterV2CheckoutFlow>[0]> = {}) => {
    const decision = resolveRouterV2CheckoutFlow({ content, state, allowedDeliveryMethods: ["DELIVERY", "RECOJO"], allowedPaymentMethods: ["Yape"], ...extra });
    state = { ...state, ...decision.patch };
    return decision;
  };
  assert.equal(advance("si").step, "ASK_CUSTOMER_DATA");
  const customer = advance("Me llamo María Pérez, 999888777");
  assert.deepEqual(customer.patch.customerData, { name: "María Pérez", phone: "999888777" });
  assert.equal(customer.step, "ASK_DOCUMENT_TYPE");
  assert.equal(advance("boleta DNI 12345678").step, "ASK_DELIVERY_METHOD");
  assert.equal(advance("delivery", { deliveryMethodCandidate: "DELIVERY" }).step, "ASK_DELIVERY_DETAILS");
  assert.equal(advance("Av. Prueba 100, Lima").step, "ASK_ORDER_CONFIRMATION");
  assert.equal(advance("no").createPendingOrder, false);
  assert.equal(state.stage, "AWAITING_ORDER_CONFIRMATION");
  assert.equal(advance("confirmo").createPendingOrder, true);
  assert.equal(advance("yape", { paymentMethodCandidate: "YAPE" }).step, "ASK_PAYMENT_EVIDENCE");
  assert.equal(advance("ya pague", { messageType: "AUDIO", mediaUrl: "https://example.com/audio.ogg" }).step, "ASK_PAYMENT_EVIDENCE");
  const receipt = advance("comprobante", { messageType: "IMAGE", mediaUrl: "https://example.com/receipt.png" });
  assert.equal(receipt.step, "PAYMENT_EVIDENCE_RECEIVED");
  assert.equal((receipt.patch.paymentData as { verified: boolean }).verified, false);
  assert.equal((state as typeof state & { customerData: { name: string } }).customerData.name, "María Pérez");
});

test("document numbers are exact and unambiguous, never inferred from concatenated digits", () => {
  for (const content of ["999888777", "20123456789", "123456789", "1234 y 5678", "12345678 o 87654321"]) {
    const decision = resolveRouterV2CheckoutFlow({ content, state: { stage: "AWAITING_DOCUMENT_DATA", documentData: { type: "BOLETA" } } });
    assert.equal(decision.step, "ASK_DOCUMENT_DATA", content);
    assert.equal(decision.patch.documentData, undefined);
  }
  for (const [type, number] of [["BOLETA", "12345678"], ["FACTURA", "20123456789"]]) {
    const decision = resolveRouterV2CheckoutFlow({ content: `${type} ${number}`, state: { stage: "AWAITING_DOCUMENT_TYPE" } });
    assert.deepEqual(decision.patch.documentData, { type, number });
    assert.equal(decision.step, "ASK_DELIVERY_METHOD");
  }
});

test("a repeat price confirmation preserves customer-supplied details over the channel profile", () => {
  const decision = resolveRouterV2CheckoutFlow({ content: "si", contact: { name: "Perfil WhatsApp", phone: "51999999999" }, state: {
    stage: "AWAITING_PRICE_CONFIRMATION", customerData: { name: "María Pérez", phone: "51999888777" },
  } });
  assert.deepEqual(decision.patch.customerData, { name: "María Pérez", phone: "51999888777" });
});
