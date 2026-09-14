import assert from "node:assert/strict";
import test from "node:test";

import { resolveRouterV2CheckoutFlow } from "@/lib/router-v2-checkout-flow";
import { buildRouterV2ResponsePlan } from "@/lib/router-v2-response-plan";

test("declining product purchase returns safely to product search", () => {
  const checkout = resolveRouterV2CheckoutFlow({
    content: "no gracias",
    state: {
      stage: "AWAITING_PURCHASE_CONFIRMATION",
    },
  });

  assert.equal(checkout.consumedInput, true);
  assert.equal(checkout.step, "PURCHASE_DECLINED");
  assert.equal(checkout.patch.stage, "AWAITING_PRODUCT_QUERY");
  assert.equal(checkout.patch.purchaseIntent, false);
  assert.equal(checkout.patch.selectedProductCode, null);
});

test("declining price confirmation never advances checkout", () => {
  const checkout = resolveRouterV2CheckoutFlow({
    content: "mejor no",
    state: {
      stage: "AWAITING_PRICE_CONFIRMATION",
    },
  });

  assert.equal(checkout.consumedInput, true);
  assert.equal(checkout.step, "PRICE_CHANGES_REQUESTED");
  assert.equal(checkout.createPendingOrder, false);
  assert.equal(checkout.patch.stage, undefined);
});

test("declining final order confirmation never creates order", () => {
  const checkout = resolveRouterV2CheckoutFlow({
    content: "no",
    state: {
      stage: "AWAITING_ORDER_CONFIRMATION",
    },
  });

  assert.equal(checkout.consumedInput, true);
  assert.equal(checkout.step, "ORDER_CHANGES_REQUESTED");
  assert.equal(checkout.createPendingOrder, false);
  assert.equal(checkout.patch.stage, undefined);
});

test("declined checkout step overrides generic sales response", () => {
  const plan = buildRouterV2ResponsePlan({
    finalAction: "CONTINUE_SALES_FLOW",
    state: { stage: "AWAITING_ORDER_CONFIRMATION" },
    checkoutStep: "ORDER_CHANGES_REQUESTED",
    checkoutConsumed: true,
  });

  assert.equal(plan.answerType, "ORDER_CHANGES_REQUESTED");
});
