import { z } from "zod";

export const salesConversationStages = [
  "AWAITING_PRODUCT_QUERY",
  "AWAITING_BRAND_SELECTION",
  "AWAITING_MODEL_SELECTION",
  "AWAITING_PURCHASE_CONFIRMATION",
  "AWAITING_QUANTITY",
  "AWAITING_PRICE_CONFIRMATION",
  "AWAITING_CUSTOMER_DATA",
  "AWAITING_DOCUMENT_TYPE",
  "AWAITING_DOCUMENT_DATA",
  "AWAITING_DELIVERY_METHOD",
  "AWAITING_DELIVERY_DETAILS",
  "AWAITING_ORDER_CONFIRMATION",
  "AWAITING_PAYMENT_METHOD",
  "AWAITING_PAYMENT_CONFIRMATION",
  "ORDER_CREATED",
  "COMPLETED",
] as const;

export const salesConversationStageSchema =
  z.enum(salesConversationStages);

const shownProductSchema = z.object({
  position: z.number().int().positive(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(180),
  brand: z.string().trim().max(120).nullable().optional(),
  slug: z.string().trim().min(1).max(140),
  unitPrice: z.number().nonnegative(),
  imageUrl: z.string().nullable().optional(),
});

export const salesStatePatchSchema = z.object({
  conversationId: z.string().trim().min(1).max(191),

  reset: z.boolean().optional(),

  stage: salesConversationStageSchema.optional(),

  category: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional(),

  brand: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional(),

  purchaseIntent: z.boolean().optional(),

  shownProducts: z
    .array(shownProductSchema)
    .max(20)
    .nullable()
    .optional(),

  selectedProductCode: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .optional(),

  quantity: z
    .number()
    .int()
    .positive()
    .max(100000)
    .nullable()
    .optional(),

  unitPrice: z
    .number()
    .nonnegative()
    .nullable()
    .optional(),

  priceTier: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional(),

  total: z
    .number()
    .nonnegative()
    .nullable()
    .optional(),

  customerData: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),

  documentData: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),

  deliveryData: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),

  paymentData: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),

  orderNumber: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional(),
});

export function serializeSalesState<
  T extends {
    unitPrice: unknown;
    total: unknown;
  },
>(state: T) {
  return {
    ...state,

    unitPrice:
      state.unitPrice === null ||
      state.unitPrice === undefined
        ? null
        : Number(state.unitPrice),

    total:
      state.total === null ||
      state.total === undefined
        ? null
        : Number(state.total),
  };
}
