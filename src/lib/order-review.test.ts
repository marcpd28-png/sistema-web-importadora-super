import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient, OrderStatus } from "@prisma/client";
import { reviewOrder } from "./order-review";

function fixture(status: OrderStatus = "PENDING", isTest = false) {
  const order = { id: "order", status, isTest, adminNotes: "Voucher original: pendiente" };
  const reviews: unknown[] = [];
  const db = {
    $queryRaw: async () => [{ id: order.id }],
    order: { findUnique: async () => ({ ...order }), update: async ({ data }: { data: object }) => Object.assign(order, data) },
    orderReview: { create: async ({ data }: { data: unknown }) => { reviews.push(data); } },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db: db as unknown as PrismaClient, order, reviews };
}
const actor = { orderId: "order", actorId: "advisor-1" };

test("manual review records actor and reference, preserving voucher evidence", async () => {
  const { db, order, reviews } = fixture();
  await reviewOrder(db, { ...actor, action: "PAYMENT_CONFIRMED", note: "Abono revisado: operación 123" });
  assert.equal(order.status, "PAID");
  assert.match(order.adminNotes, /Voucher original/);
  assert.match(order.adminNotes, /operación 123/);
  assert.deepEqual(reviews[0], { ...actor, action: "PAYMENT_CONFIRMED", previousStatus: "PENDING", nextStatus: "PAID", note: "Abono revisado: operación 123" });
  await reviewOrder(db, { ...actor, action: "SHIPPED" });
  await reviewOrder(db, { ...actor, action: "DELIVERED" });
  assert.equal(order.status, "DELIVERED");
});
test("reject unpaid shipment, repeat approval, canceled order revival and missing payment reference", async () => {
  for (const [status, action, note] of [
    ["PENDING", "SHIPPED", ""], ["PAID", "PAYMENT_CONFIRMED", "123"],
    ["CANCELED", "PAYMENT_CONFIRMED", "123"], ["PENDING", "PAYMENT_CONFIRMED", ""],
    ["SHIPPED", "CANCELED", "cancelar"],
  ] as const) {
    const { db, order, reviews } = fixture(status);
    await assert.rejects(reviewOrder(db, { ...actor, action, note }));
    assert.equal(order.status, status); assert.equal(reviews.length, 0);
  }
});
test("test orders cannot be paid or shipped even if notes were edited", async () => {
  const { db, order, reviews } = fixture("PENDING", true);
  order.adminNotes = "";
  await assert.rejects(reviewOrder(db, { ...actor, action: "PAYMENT_CONFIRMED", note: "123" }), /prueba/);
  assert.equal(reviews.length, 0);
  await reviewOrder(db, { ...actor, action: "CANCELED", note: "Fin de prueba" });
  assert.equal(order.status, "CANCELED");
});
