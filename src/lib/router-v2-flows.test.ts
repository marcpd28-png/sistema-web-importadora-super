import assert from "node:assert/strict";
import test from "node:test";

import { analyzeRouterV2Message } from "@/lib/conversation-router-v2";
import { resolveRouterV2CatalogFlow } from "@/lib/router-v2-catalog-flow";
import { resolveRouterV2CheckoutFlow } from "@/lib/router-v2-checkout-flow";
import { applyRouterV2ContextualSlots } from "@/lib/router-v2-contextual-slots";
import { applyRouterV2DeliverySelection } from "@/lib/router-v2-delivery-selection";
import { resolveRouterV2PaymentSelection } from "@/lib/router-v2-payment-selection";
import { buildRouterV2ResponsePlan } from "@/lib/router-v2-response-plan";

test("catalog request asks wholesale or retail", () => {
  const analysis = analyzeRouterV2Message({ content: "Quiero el catalogo" });
  const decision = resolveRouterV2CatalogFlow({
    analysis,
    content: "Quiero el catalogo",
    currentState: null,
  });

  assert.equal(decision.action, "ASK_PURCHASE_MODE");
  assert.equal(
    (decision.patch.customerData as Record<string, unknown>).catalogPending,
    true,
  );
});

test("pending catalog routes wholesale and retail explicitly", () => {
  const currentState = { customerData: { catalogPending: true } };

  const wholesale = resolveRouterV2CatalogFlow({
    analysis: analyzeRouterV2Message({ content: "por mayor" }),
    content: "por mayor",
    currentState,
  });
  assert.equal(wholesale.action, "SEND_WHOLESALE_CATALOG");
  assert.equal(wholesale.mode, "WHOLESALE");

  const retail = resolveRouterV2CatalogFlow({
    analysis: analyzeRouterV2Message({ content: "por unidades" }),
    content: "por unidades",
    currentState,
  });
  assert.equal(retail.action, "START_RETAIL_DISCOVERY");
  assert.equal(retail.mode, "RETAIL");
});

test("active retail mode continues broad product discovery", () => {
  const analysis = analyzeRouterV2Message({ content: "parlantes JBL" });
  const decision = resolveRouterV2CatalogFlow({
    analysis,
    content: "parlantes JBL",
    currentState: {
      customerData: {
        catalogPending: false,
        shoppingMode: "RETAIL",
      },
    },
  });

  assert.equal(decision.action, "START_RETAIL_DISCOVERY");
});

test("delivery inquiry is not stored as a selection", () => {
  const inquiry = "¿Hacen envío por Shalom?";
  const analysis = applyRouterV2DeliverySelection({
    analysis: analyzeRouterV2Message({ content: inquiry }),
    content: inquiry,
    stage: "AWAITING_PRICE_CONFIRMATION",
  });

  assert.equal(analysis.slots.deliveryMethod, undefined);

  const selected = applyRouterV2DeliverySelection({
    analysis: analyzeRouterV2Message({ content: "Shalom" }),
    content: "Shalom",
    stage: "AWAITING_DELIVERY_METHOD",
  });
  assert.equal(selected.slots.deliveryMethod, "SHALOM");
});

test("payment inquiry is not stored as a selection", () => {
  assert.equal(
    resolveRouterV2PaymentSelection({
      content: "¿Aceptan Yape?",
      stage: "AWAITING_PAYMENT_METHOD",
    }),
    null,
  );

  assert.equal(
    resolveRouterV2PaymentSelection({
      content: "Yape",
      stage: "AWAITING_PAYMENT_METHOD",
    }),
    "YAPE",
  );
});

test("quantity can be corrected while confirming price", () => {
  const analysis = applyRouterV2ContextualSlots({
    analysis: analyzeRouterV2Message({ content: "mejor 2" }),
    content: "mejor 2",
    stage: "AWAITING_PRICE_CONFIRMATION",
  });

  assert.equal(analysis.slots.quantity, 2);
  assert.ok(analysis.intents.includes("QUANTITY"));
});

test("purchase confirmation advances to quantity", () => {
  const checkout = resolveRouterV2CheckoutFlow({
    content: "sí",
    state: { stage: "AWAITING_PURCHASE_CONFIRMATION" },
  });

  assert.equal(checkout.consumedInput, true);
  assert.equal(checkout.step, "ASK_QUANTITY");
  assert.equal(checkout.patch.purchaseIntent, true);
  assert.equal(checkout.patch.stage, "AWAITING_QUANTITY");
});

test("checkout consumes explicit invoice, delivery and payment choices", () => {
  const invoice = resolveRouterV2CheckoutFlow({
    content: "factura",
    state: { stage: "AWAITING_DOCUMENT_TYPE" },
  });
  assert.equal(invoice.consumedInput, true);
  assert.equal(invoice.step, "ASK_DOCUMENT_DATA");

  const delivery = resolveRouterV2CheckoutFlow({
    content: "Shalom",
    state: { stage: "AWAITING_DELIVERY_METHOD" },
    deliveryMethodCandidate: "SHALOM",
    allowedDeliveryMethods: ["Shalom", "Recojo"],
  });
  assert.equal(delivery.consumedInput, true);
  assert.equal(delivery.step, "ASK_DELIVERY_DETAILS");

  const payment = resolveRouterV2CheckoutFlow({
    content: "Yape",
    state: { stage: "AWAITING_PAYMENT_METHOD" },
    paymentMethodCandidate: "YAPE",
    allowedPaymentMethods: ["Yape", "Transferencia"],
  });
  assert.equal(payment.consumedInput, true);
  assert.equal(payment.step, "ASK_PAYMENT_EVIDENCE");
});

test("voucher is evidence but never automatic verification", () => {
  const checkout = resolveRouterV2CheckoutFlow({
    content: "",
    messageType: "IMAGE",
    mediaUrl: "https://example.test/voucher.jpg",
    state: {
      stage: "AWAITING_PAYMENT_CONFIRMATION",
      paymentData: { method: "YAPE" },
    },
  });

  const paymentData = checkout.patch.paymentData as Record<string, unknown>;
  assert.equal(checkout.consumedInput, true);
  assert.equal(checkout.step, "PAYMENT_EVIDENCE_RECEIVED");
  assert.equal(paymentData.evidenceReceived, true);
  assert.equal(paymentData.verified, false);
});

test("consumed checkout transition overrides generic payment answer", () => {
  const plan = buildRouterV2ResponsePlan({
    finalAction: "ANSWER_PAYMENT",
    state: { stage: "AWAITING_PAYMENT_CONFIRMATION" },
    checkoutStep: "ASK_PAYMENT_EVIDENCE",
    checkoutConsumed: true,
  });

  assert.equal(plan.answerType, "CHECKOUT_PAYMENT_EVIDENCE");
  assert.equal(plan.resumeAction, "ASK_PAYMENT_EVIDENCE");
});
