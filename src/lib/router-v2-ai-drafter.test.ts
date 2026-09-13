import assert from "node:assert/strict";
import test from "node:test";

import {
  draftRouterV2WithAi,
  routerV2AiDraftPassesGuard,
  type RouterV2AiDraftResult,
} from "@/lib/router-v2-ai-drafter";
import type { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";

type ResponseContext = ReturnType<typeof buildRouterV2ResponseContext>;

function context(overrides: Partial<ResponseContext["sales"]> = {}) {
  return {
    customerMessage: "Quiero cuatro",
    answerType: "PRICE_SUMMARY",
    resumeAction: "ASK_PRICE_CONFIRMATION",
    checkoutStep: null,
    sales: {
      stage: "AWAITING_PRICE_CONFIRMATION",
      purchaseIntent: true,
      productCode: "(O399-AZUL)",
      productName: "JBL FLIP 7 AZUL",
      category: "PARLANTES",
      brand: "JBL",
      quantity: 4,
      unitPrice: 335,
      priceTier: "MAYORISTA",
      total: 1340,
      shownProducts: [],
      customerName: null,
      customerPhone: null,
      customerCity: null,
      shoppingMode: null,
      catalogPending: false,
      documentType: null,
      documentNumber: null,
      deliveryMethod: null,
      deliveryDetails: null,
      paymentMethod: null,
      paymentEvidenceReceived: false,
      paymentVerified: false,
      orderNumber: null,
      ...overrides,
    },
    product: null,
    catalog: {
      decision: "NONE",
      shoppingMode: null,
      wholesaleCatalogUrl: null,
      retailStoreUrl: "https://example.test",
      retailProducts: [],
    },
    business: {
      businessName: "Importaciones Super",
      currencySymbol: "S/",
      supportHours: "",
      storeAddress: "",
      paymentMethods: [],
      deliveryMethods: [],
    },
    order: null,
    visual: null,
    constraints: {
      answerCustomerQuestionFirst: true,
      doNotInventPrices: true,
      doNotInventStock: true,
      doNotExposeStockQuantity: true,
      doNotInventSpecifications: true,
      doNotInventBusinessPolicies: true,
      doNotAssumeImageIdentity: true,
      doNotMarkPaymentVerifiedFromVoucher: true,
      preserveSelectedProduct: true,
      followResumeActionExactly: true,
    },
  } as ResponseContext;
}

void (null as RouterV2AiDraftResult | null);

test("ai drafting is opt-in and deterministic by default", async () => {
  const previous = process.env.ROUTER_V2_ENABLE_AI_DRAFTS;
  process.env.ROUTER_V2_ENABLE_AI_DRAFTS = "false";

  try {
    const result = await draftRouterV2WithAi({
      baseline: "¿Cuántas unidades deseas?",
      context: context(),
    });

    assert.equal(result.status, "NOT_CONFIGURED");
    assert.equal(result.text, "¿Cuántas unidades deseas?");
  } finally {
    if (previous === undefined) {
      delete process.env.ROUTER_V2_ENABLE_AI_DRAFTS;
    } else {
      process.env.ROUTER_V2_ENABLE_AI_DRAFTS = previous;
    }
  }
});

test("ai fact guard accepts stylistic rewrite with identical numeric facts", () => {
  const baseline =
    "4 unidades de JBL FLIP 7 AZUL código (O399-AZUL): S/335.00 c/u. Total: S/1340.00.";
  const candidate =
    "Perfecto: son 4 unidades del JBL FLIP 7 AZUL, código (O399-AZUL), a S/335.00 c/u. Total S/1340.00.";

  assert.equal(
    routerV2AiDraftPassesGuard({
      baseline,
      candidate,
      context: context(),
    }),
    true,
  );
});

test("ai fact guard rejects changed or invented numbers", () => {
  const baseline =
    "4 unidades de JBL FLIP 7 AZUL código (O399-AZUL): S/335.00 c/u. Total: S/1340.00.";

  assert.equal(
    routerV2AiDraftPassesGuard({
      baseline,
      candidate:
        "4 unidades del JBL FLIP 7 AZUL código (O399-AZUL) a S/330.00 c/u. Total S/1320.00.",
      context: context(),
    }),
    false,
  );

  assert.equal(
    routerV2AiDraftPassesGuard({
      baseline,
      candidate:
        "4 unidades del JBL FLIP 7 AZUL código (O399-AZUL) a S/335.00 c/u. Total S/1340.00. Entrega en 24 horas.",
      context: context(),
    }),
    false,
  );
});

test("ai fact guard preserves repeated numeric facts", () => {
  assert.equal(
    routerV2AiDraftPassesGuard({
      baseline: "Son 2 unidades y el paquete también indica 2 unidades.",
      candidate: "Son 2 unidades.",
      context: context(),
    }),
    false,
  );
});

test("ai fact guard cannot remove a decimal separator", () => {
  assert.equal(
    routerV2AiDraftPassesGuard({
      baseline: "Precio: S/335.00.",
      candidate: "Precio: S/33500.",
      context: context(),
    }),
    false,
  );
});

test("ai fact guard rejects removal of protected product code", () => {
  const baseline =
    "4 unidades de JBL FLIP 7 AZUL código (O399-AZUL): S/335.00 c/u. Total: S/1340.00.";
  const candidate =
    "4 unidades de JBL FLIP 7 AZUL a S/335.00 c/u. Total S/1340.00.";

  assert.equal(
    routerV2AiDraftPassesGuard({
      baseline,
      candidate,
      context: context(),
    }),
    false,
  );
});
