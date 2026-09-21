import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { reviewOrder } from "../../src/lib/order-review";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(process.argv.includes("--execute-local") && ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/bc_cart_test_"), "Use an explicitly selected disposable local bc_cart_test_ database");
  const db = new PrismaClient();
  const ids = [randomUUID(), randomUUID()];
  try {
    for (const [index, id] of ids.entries()) await db.order.create({ data: {
      id, customerName: "Revisión local", customerPhone: "51900000001", total: 100,
      isTest: index === 1, adminNotes: "Comprobante original", status: "PENDING",
    } });
    const results = await Promise.allSettled(["actor-1", "actor-2"].map(actorId => reviewOrder(db, {
      orderId: ids[0], actorId, action: "PAYMENT_CONFIRMED", note: "Referencia de prueba 123",
    })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1, "exactly one concurrent reviewer may approve");
    const order = await db.order.findUniqueOrThrow({ where: { id: ids[0] }, include: { reviews: true } });
    assert.equal(order.status, "PAID"); assert.equal(order.reviews.length, 1);
    assert.match(order.adminNotes!, /Comprobante original/);
    assert.ok(["actor-1", "actor-2"].includes(order.reviews[0].actorId));
    await reviewOrder(db, { orderId: ids[0], actorId: "actor-1", action: "SHIPPED" });
    await reviewOrder(db, { orderId: ids[0], actorId: "actor-1", action: "DELIVERED" });
    await assert.rejects(reviewOrder(db, { orderId: ids[0], actorId: "actor-1", action: "CANCELED", note: "No debe permitirse" }));
    await assert.rejects(reviewOrder(db, { orderId: ids[1], actorId: "actor-1", action: "PAYMENT_CONFIRMED", note: "No debe permitirse" }));
    assert.equal(await db.orderReview.count({ where: { orderId: ids[1] } }), 0);
    console.log("Order review: concurrency, history and test-order protection passed.");
  } finally {
    await db.order.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
