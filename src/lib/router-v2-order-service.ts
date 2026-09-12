import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { resolveCommercialPrice } from "@/lib/router-v2-commercial-price";

type SalesStateLike = {
  selectedProductCode?: string | null;
  quantity?: number | null;
  customerData?: unknown;
  documentData?: unknown;
  deliveryData?: unknown;
  paymentData?: unknown;
  orderNumber?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function buildOrderNumber() {
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `WA-${y}${m}${d}-${suffix}`;
}

function mapDeliveryType(method: string | null) {
  if (method === "RECOJO") return "PICKUP";
  if (method === "SHALOM" || method === "OLVA") return "PROVINCE";
  return "DELIVERY";
}

export function extractRouterV2OrderNumber(content: string) {
  const match = content
    .toUpperCase()
    .match(/\b(?:WA-\d{8}-[A-Z0-9]{6}|ORD-\d{3,})\b/);

  return match?.[0] ?? null;
}

export async function createRouterV2PendingOrder(input: {
  conversationId: string;
  state: SalesStateLike;
  currencySymbol?: string | null;
}) {
  if (input.state.orderNumber) {
    const existing = await prisma.order.findUnique({
      where: { orderNumber: input.state.orderNumber },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        total: true,
      },
    });

    if (existing) {
      return {
        status: "EXISTING" as const,
        order: {
          ...existing,
          total: Number(existing.total),
        },
      };
    }
  }

  const productCode = input.state.selectedProductCode?.trim() ?? "";
  const quantity = input.state.quantity ?? 0;

  if (!productCode || !Number.isInteger(quantity) || quantity <= 0) {
    return {
      status: "INVALID_SALES_STATE" as const,
      reason: "PRODUCT_OR_QUANTITY_MISSING" as const,
    };
  }

  const price = await resolveCommercialPrice(productCode, quantity);
  if (price.status !== "READY") {
    return {
      status: "INVALID_SALES_STATE" as const,
      reason: "PRODUCT_NOT_AVAILABLE" as const,
    };
  }

  const customerName = readString(input.state.customerData, "name");
  const customerPhone = readString(input.state.customerData, "phone");
  const customerEmail = readString(input.state.customerData, "email");
  const documentType = readString(input.state.documentData, "type");
  const documentNumber = readString(input.state.documentData, "number");
  const deliveryMethod = readString(input.state.deliveryData, "method");
  const deliveryDetails = readString(input.state.deliveryData, "details");

  if (!customerName || !customerPhone || !documentType || !deliveryMethod) {
    return {
      status: "INVALID_SALES_STATE" as const,
      reason: "CHECKOUT_DATA_MISSING" as const,
    };
  }

  if (documentType === "FACTURA" && !documentNumber) {
    return {
      status: "INVALID_SALES_STATE" as const,
      reason: "RUC_MISSING" as const,
    };
  }

  const product = await prisma.product.findUnique({
    where: { code: price.product.code },
    select: {
      id: true,
      externalId: true,
    },
  });

  if (!product) {
    return {
      status: "INVALID_SALES_STATE" as const,
      reason: "PRODUCT_NOT_FOUND" as const,
    };
  }

  const orderNumber = buildOrderNumber();

  const order = await prisma.order.create({
    data: {
      orderNumber,
      status: "PENDING",
      paymentMethod: null,
      customerName,
      customerPhone,
      customerEmail,
      customerDocumentType: documentType,
      customerDocumentNumber: documentNumber,
      customerAddress: deliveryDetails,
      deliveryType: mapDeliveryType(deliveryMethod),
      currencySymbol: input.currencySymbol?.trim() || "S/",
      total: price.total,
      adminNotes: `Pedido originado por Router V2. Conversation: ${input.conversationId}. Método de entrega: ${deliveryMethod}.`,
      items: {
        create: [
          {
            productId: product.id,
            externalId: product.externalId,
            code: price.product.code,
            name: price.product.name,
            quantity: price.quantity,
            unitPrice: price.unitPrice,
            total: price.total,
            tierLabel: price.priceTier,
          },
        ],
      },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      total: true,
    },
  });

  return {
    status: "CREATED" as const,
    order: {
      ...order,
      total: Number(order.total),
    },
  };
}

export async function updateRouterV2OrderPaymentMethod(input: {
  orderNumber: string;
  paymentMethod: string;
}) {
  const order = await prisma.order.findUnique({
    where: { orderNumber: input.orderNumber },
    select: { id: true, status: true },
  });

  if (!order || order.status !== "PENDING") {
    return { status: "NOT_UPDATABLE" as const };
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { paymentMethod: input.paymentMethod },
    select: {
      orderNumber: true,
      status: true,
      paymentMethod: true,
      total: true,
    },
  });

  return {
    status: "UPDATED" as const,
    order: {
      ...updated,
      total: Number(updated.total),
    },
  };
}

export async function getRouterV2OrderStatus(orderNumber: string) {
  const normalized = orderNumber.trim();
  if (!normalized) return null;

  const order = await prisma.order.findUnique({
    where: { orderNumber: normalized },
    select: {
      orderNumber: true,
      status: true,
      paymentMethod: true,
      deliveryType: true,
      total: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!order) return null;

  return {
    ...order,
    total: Number(order.total),
  };
}
