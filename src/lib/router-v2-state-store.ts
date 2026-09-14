import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  salesStatePatchSchema,
  serializeSalesState,
} from "@/lib/conversation-sales-state";

function toPrismaJson(value: unknown) {
  if (value === null) return Prisma.JsonNull;
  if (value === undefined) return undefined;

  return value as Prisma.InputJsonValue;
}

export async function persistRouterV2State(
  conversationId: string,
  rawPatch: Record<string, unknown>,
) {
  const input = salesStatePatchSchema.parse({
    conversationId,
    ...rawPatch,
  });

  const {
    conversationId: id,
    reset: _reset,
    ...patch
  } = input;

  const data: Prisma.ConversationSalesStateUpdateInput = {};

  const scalarKeys = [
    "stage",
    "category",
    "brand",
    "purchaseIntent",
    "selectedProductCode",
    "quantity",
    "unitPrice",
    "priceTier",
    "total",
    "orderNumber",
  ] as const;

  for (const key of scalarKeys) {
    if (patch[key] !== undefined) {
      Object.assign(data, { [key]: patch[key] });
    }
  }

  const jsonKeys = [
    "shownProducts",
    "customerData",
    "documentData",
    "deliveryData",
    "paymentData",
  ] as const;

  for (const key of jsonKeys) {
    const value = patch[key];

    if (value !== undefined) {
      Object.assign(data, {
        [key]:
          value === null
            ? Prisma.JsonNull
            : (value as Prisma.InputJsonValue),
      });
    }
  }

  const state = await prisma.conversationSalesState.upsert({
    where: {
      conversationId: id,
    },

    create: {
      conversationId: id,
      stage: patch.stage ?? "AWAITING_PRODUCT_QUERY",
      category: patch.category ?? null,
      brand: patch.brand ?? null,
      purchaseIntent: patch.purchaseIntent ?? false,
      shownProducts: toPrismaJson(patch.shownProducts),
      selectedProductCode: patch.selectedProductCode ?? null,
      quantity: patch.quantity ?? null,
      unitPrice: patch.unitPrice ?? null,
      priceTier: patch.priceTier ?? null,
      total: patch.total ?? null,
      customerData: toPrismaJson(patch.customerData),
      documentData: toPrismaJson(patch.documentData),
      deliveryData: toPrismaJson(patch.deliveryData),
      paymentData: toPrismaJson(patch.paymentData),
      orderNumber: patch.orderNumber ?? null,
    },

    update: data,
  });

  return serializeSalesState(state);
}
