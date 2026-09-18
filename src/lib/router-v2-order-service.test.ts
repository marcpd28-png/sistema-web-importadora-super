import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";

test("simulated checkout validates price but never reads or writes real orders", async () => {
  const forbid = () => { throw new Error("Real order access forbidden"); };
  const previous = global.prismaGlobal;
  global.prismaGlobal = {
    order: { findUnique: forbid, create: forbid }, $transaction: forbid,
    product: { findFirst: async () => ({
    code: "TEST", name: "Test product", brand: null, category: null,
    unitPrice: 100, wholesalePrice: null, wholesaleMinQty: 3, stockUnits: 10,
    }) },
  } as unknown as PrismaClient;
  try {
    const { createRouterV2PendingOrder } = await import("./router-v2-order-service");
    const state = {
      selectedProductCode: "TEST", quantity: 2, orderNumber: "WA-20260917-ABCDEF",
      customerData: { name: "Cliente prueba", phone: "51999888777" },
      documentData: { type: "BOLETA" }, deliveryData: { method: "RECOJO" },
    };
    const result = await createRouterV2PendingOrder({ conversationId: "test-conversation", state, simulation: true });
    assert.equal(result.status, "CREATED");
    if (result.status === "CREATED") {
      assert.match(result.order.orderNumber ?? "", /^SIM-/);
      assert.equal(result.order.total, 200);
    }
    const invalid = await createRouterV2PendingOrder({ conversationId: "test", state: { ...state, quantity: 11 }, simulation: true });
    assert.equal(invalid.status, "INVALID_SALES_STATE");
    const changed = await createRouterV2PendingOrder({ conversationId: "test", state: { ...state, total: 180, unitPrice: 90 }, simulation: true });
    assert.equal(changed.status, "INVALID_SALES_STATE");
    if (changed.status === "INVALID_SALES_STATE") assert.equal(changed.reason, "PRICE_CHANGED");
  } finally { global.prismaGlobal = previous; }
});
