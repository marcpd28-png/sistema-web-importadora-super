import assert from "node:assert/strict";
import test from "node:test";

import { buildRouterV2ResponseDraft } from "@/lib/router-v2-response-draft";
import type { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";

type ResponseContext = ReturnType<typeof buildRouterV2ResponseContext>;

function baseContext(
  answerType: ResponseContext["answerType"],
): ResponseContext {
  return {
    customerMessage: "no",
    answerType,
    resumeAction: "CONTINUE_SALES_FLOW",
    checkoutStep: null,
    sales: {
      stage: null,
      purchaseIntent: false,
      productCode: null,
      productName: null,
      category: null,
      brand: null,
      quantity: null,
      unitPrice: null,
      priceTier: null,
      total: null,
      shownProducts: [],
      customerName: null,
      customerPhone: null,
      customerCity: null,
      shoppingMode: null,
      catalogPending: null,
      documentType: null,
      documentNumber: null,
      deliveryMethod: null,
      deliveryDetails: null,
      paymentMethod: null,
      paymentEvidenceReceived: false,
      paymentVerified: false,
      orderNumber: null,
    },
    product: null,
    catalog: {
      decision: "NONE",
      shoppingMode: null,
      wholesaleCatalogUrl: null,
      retailStoreUrl: null,
      retailProducts: [],
    },
    business: null,
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
  };
}

test("declined purchase draft moves customer back to product discovery", () => {
  const text = buildRouterV2ResponseDraft(
    baseContext("PURCHASE_DECLINED"),
  );

  assert.match(text, /no continuar/i);
  assert.match(text, /otro producto|categoría/i);
});

test("price and order declines ask what should be changed", () => {
  assert.match(
    buildRouterV2ResponseDraft(
      baseContext("PRICE_CHANGES_REQUESTED"),
    ),
    /qué deseas cambiar/i,
  );

  assert.match(
    buildRouterV2ResponseDraft(
      baseContext("ORDER_CHANGES_REQUESTED"),
    ),
    /qué deseas corregir/i,
  );
});

test("unavailable stock draft never asks customer to buy it", () => {
  const context = baseContext("PRODUCT_STOCK");
  context.sales.productName = "Producto prueba";
  context.resumeAction = "ASK_PURCHASE_CONFIRMATION";
  context.product = {
    slug: "producto-prueba",
    imageUrl: null,
    media: [],
    description: null,
    descriptionShort: null,
    descriptionFull: null,
    technicalSpecs: null,
    available: false,
    wholesalePrice: null,
    wholesaleMinQty: 3,
    specifications: [],
    matchedSpecification: null,
    variants: [],
    documents: [],
  };

  const text = buildRouterV2ResponseDraft(context);
  assert.match(text, /no aparece disponible/i);
  assert.match(text, /alternativa/i);
  assert.doesNotMatch(text, /deseas comprar este producto/i);
});
