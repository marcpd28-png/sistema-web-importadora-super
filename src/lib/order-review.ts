import type { OrderStatus, PrismaClient } from "@prisma/client";

type ReviewAction = "PAYMENT_CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELED" | "NOTE";
export class OrderReviewError extends Error {}
const transitions: Record<Exclude<ReviewAction, "NOTE">, { from: OrderStatus[]; to: OrderStatus }> = {
  PAYMENT_CONFIRMED: { from: ["PENDING"], to: "PAID" },
  SHIPPED: { from: ["PAID"], to: "SHIPPED" },
  DELIVERED: { from: ["SHIPPED"], to: "DELIVERED" },
  CANCELED: { from: ["PENDING", "PAID", "FAILED"], to: "CANCELED" },
};

/** Human review only: no bank verification or inventory movement is implied. */
export async function reviewOrder(db: PrismaClient, input: {
  orderId: string; actorId: string; action: ReviewAction; note?: string;
}) {
  const note = input.note?.trim() ?? "";
  if (!input.actorId || !input.orderId || note.length > 4000) throw new OrderReviewError("Datos de revisión inválidos; la nota admite hasta 4000 caracteres.");
  if ((input.action === "PAYMENT_CONFIRMED" || input.action === "CANCELED" || input.action === "NOTE") && !note) {
    throw new OrderReviewError(input.action === "PAYMENT_CONFIRMED" ? "Indica la referencia del abono que verificaste en la cuenta receptora." : "Escribe una nota para registrar esta acción.");
  }
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new OrderReviewError("No se encontró el pedido.");
    if ((order.isTest || order.adminNotes?.includes("PRUEBA BC AUTORIZADA - NO COBRAR NI DESPACHAR")) && !["NOTE", "CANCELED"].includes(input.action)) {
      throw new OrderReviewError("Este pedido es de prueba: solo permite notas o cancelación.");
    }
    const transition = input.action === "NOTE" ? null : transitions[input.action];
    if (transition && !transition.from.includes(order.status)) {
      throw new OrderReviewError("El estado del pedido cambió o no permite esta acción. Actualiza la página y revisa el pedido.");
    }
    const nextStatus = transition?.to ?? order.status;
    await tx.orderReview.create({ data: { orderId: order.id, actorId: input.actorId, action: input.action,
      previousStatus: order.status, nextStatus, note } });
    await tx.order.update({ where: { id: order.id }, data: { status: nextStatus,
      ...(note ? { adminNotes: [order.adminNotes, note].filter(Boolean).join("\n") } : {}),
    } });
  });
}
