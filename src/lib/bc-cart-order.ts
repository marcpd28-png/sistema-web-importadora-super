import type { Prisma } from "@prisma/client";
import { priceMultiCart, type MultiCart } from "./bc-multi-cart";
import type { CommercialProduct } from "./commercial-catalog";
import { getBcLivePolicy } from "./bc-live-policy";

/** Pending orders do not own ERP inventory. Fulfilment/payment approval remains manual. */
export async function persistBcCartOrder(tx: Prisma.TransactionClient, input: {
  previous?: MultiCart; cart: MultiCart; conversationId: string; phone: string;
}) {
  const { cart, previous } = input;
  if (cart.mode !== "LIVE" || !cart.orderNumber) return;
  if (!previous?.orderNumber) {
    if (previous?.stage !== "CONFIRM" || cart.stage !== "PAYMENT" || !cart.name || !cart.documentNumber || !cart.documentType || !cart.delivery) throw new Error("INVALID_ORDER_TRANSITION");
    // Hold the source rows through persistence; concurrent ERP refresh cannot change the quote in between.
    for (const code of [...new Set(cart.lines.map(line => line.code))].sort()) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE code = ${code} FOR SHARE`;
    }
    const products = await tx.product.findMany({ where: { code: { in: cart.lines.map(line => line.code) }, isVisible: true } });
    const fresh = priceMultiCart(cart.lines, products as unknown as CommercialProduct[]).cart;
    if (!fresh || fresh.total !== cart.total || JSON.stringify(fresh.lines) !== JSON.stringify(cart.lines)) throw new Error("BC_ORDER_INVENTORY_CHANGED");
    await tx.order.create({ data: {
      isTest: getBcLivePolicy().testMode,
      orderNumber: cart.orderNumber, status: "PENDING", customerName: cart.name, customerPhone: input.phone,
      customerDocumentType: cart.documentType === "BOLETA" ? "DNI" : "RUC", customerDocumentNumber: cart.documentNumber,
      customerAddress: cart.address, deliveryType: cart.delivery.toUpperCase() === "RECOJO" ? "PICKUP" : cart.delivery.toUpperCase() === "SHALOM" ? "PROVINCE" : "DELIVERY",
      total: cart.total, currencySymbol: "PEN", paymentMethod: "MANUAL",
      adminNotes: `${getBcLivePolicy().testMode ? "PRUEBA BC AUTORIZADA - NO COBRAR NI DESPACHAR. " : ""}BC conversación ${input.conversationId}. ${cart.documentType}. Stock NO reservado; revalidar inventario y cotizar flete antes de cobrar o despachar.`,
      items: { create: cart.lines.map(line => ({ ...line, productId: products.find(p => p.code === line.code)!.id, tierLabel: line.quantity >= products.find(p => p.code === line.code)!.wholesaleMinQty && products.find(p => p.code === line.code)!.wholesalePrice ? "Mayorista" : "Unitario" })) },
    } });
  } else {
    if (previous.orderNumber !== cart.orderNumber) throw new Error("ORDER_REFERENCE_CHANGED");
    const order = await tx.order.findUniqueOrThrow({ where: { orderNumber: cart.orderNumber } });
    if (order.customerPhone !== input.phone) throw new Error("ORDER_OWNER_CHANGED");
    if (order.status !== "PENDING") return;
    if (cart.payment !== previous.payment || cart.voucherMessageId !== previous.voucherMessageId) {
      if (cart.voucherMessageId) {
        const voucher = await tx.chatMessage.findFirst({ where: { id: cart.voucherMessageId, conversationId: input.conversationId, direction: "INBOUND", senderType: "CUSTOMER", messageType: "IMAGE" } });
        if (!voucher) throw new Error("INVALID_VOUCHER");
      }
      await tx.order.update({ where: { id: order.id }, data: { paymentMethod: cart.payment ?? "MANUAL",
        ...(cart.voucherMessageId && cart.voucherMessageId !== previous.voucherMessageId ? { adminNotes: `${order.adminNotes ?? ""}\nVoucher ${cart.voucherMessageId}: pendiente de revisión, pago NO validado.` } : {}) } });
    }
  }
}
