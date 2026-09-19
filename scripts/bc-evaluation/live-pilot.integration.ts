import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { MultiCart } from "../../src/lib/bc-multi-cart";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(url.pathname.startsWith("/bc_cart_test_") && ["localhost", "127.0.0.1"].includes(url.hostname), "Dedicated disposable database required");
  Object.assign(process.env, { N8N_INTERNAL_API_KEY: randomUUID(), BC_REQUEST_AGENDA_ENABLED: "true", BC_MULTI_CART_ENABLED: "true", BC_CUSTOMER_MEMORY_ENABLED: "false", BC_LIVE_PILOT_ENABLED: "true", BC_LIVE_PILOT_PHONES: "51900000001", BC_LIVE_PILOT_STARTED_AT: new Date(Date.now() - 3_600_000).toISOString(), BC_LIVE_PILOT_TEST_MODE: "true", BC_VISUAL_SEARCH_ENABLED: "false", FACTURADOR_API_TOKEN: "", FACTURADOR_API_URL: "", PUSHER_APP_ID: "", N8N_OUTBOUND_WEBHOOK_URL: "https://transport.invalid/send", N8N_OUTBOUND_API_KEY: "test" });
  const { prisma } = await import("../../src/lib/prisma");
  const { POST } = await import("../../src/app/api/internal/chat/requests/route");
  const { POST: batch } = await import("../../src/app/api/internal/chat/simulator-batch/route");
  const { processBcLivePilot } = await import("../../src/lib/bc-live-worker");
  const savedFetch = globalThis.fetch;
  let deliveries = 0, failTransport = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://transport.invalid/send", "No unmocked network requests");
    const body = JSON.parse(String(init?.body)); assert.equal(body.recipient, "51900000001");
    deliveries++;
    if (failTransport) throw new Error("Transport timeout after unknown acceptance");
    return Response.json({ ok: true, provider: "fake", messageId: `wamid.test-${deliveries}` });
  };
  try {
    for (const [code, name, stockUnits, price] of [["C300", "PARLANTE PRUEBA", 10, 100], ["D400", "DRON PRUEBA", 2, 200]] as const) {
      await prisma.product.create({ data: { code, name, slug: code.toLowerCase(), stockUnits, unitPrice: price, wholesalePrice: code === "C300" ? 90 : null, wholesaleMinQty: 3, imageUrl: "https://example.test/product.jpg", isVisible: true } });
    }
    const contact = await prisma.chatContact.create({ data: { name: "Authorized test", channel: "WHATSAPP", externalId: "51900000001", phoneNormalized: "51900000001", manychatSubscriberId: "123" } });
    const conversation = await prisma.conversation.create({ data: { contactId: contact.id } });
    async function send(content: string, image = false) {
      await prisma.$executeRaw`UPDATE "ChatMessage" SET "createdAt" = "createdAt" - INTERVAL '30 seconds' WHERE "conversationId" = ${conversation.id}`;
      const inbound = await prisma.chatMessage.create({ data: { conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", messageType: image ? "IMAGE" : "TEXT", content, ...(image ? { mediaUrl: "https://example.test/voucher.jpg" } : {}), createdAt: new Date(Date.now() - 15_000) } });
      const request = () => new Request("http://localhost/api/internal/chat/requests", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY! }, body: JSON.stringify({ conversationId: conversation.id, triggerMessageId: inbound.id }) });
      const response = await POST(request()); const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result)); assert.equal(result.handled, true, JSON.stringify(result)); assert.equal(result.skipped, undefined, JSON.stringify(result));
      const count = await prisma.chatMessage.count({ where: { conversationId: conversation.id, direction: "OUTBOUND" } });
      await Promise.all([POST(request()), POST(request())]);
      assert.equal(await prisma.chatMessage.count({ where: { conversationId: conversation.id, direction: "OUTBOUND" } }), count);
      const stored = await prisma.conversationRequestAgenda.findUniqueOrThrow({ where: { conversationId: conversation.id } });
      return (stored.state as unknown as { cart: MultiCart }).cart;
    }
    let cart = await send("quiero comprar C300 1 unidad y tambien D400 1 unidad");
    assert.equal(cart.mode, "LIVE");
    for (const message of ["cambia el primero a 3", "continuar compra", "Cliente Prueba", "boleta", "12345678", "recojo"]) cart = await send(message);
    assert.equal(cart.stage, "CONFIRM");
    await prisma.product.update({ where: { code: "D400" }, data: { stockUnits: 0 } });
    cart = await send("confirmar pedido"); assert.equal(cart.stage, "REVIEW"); assert.equal(await prisma.order.count(), 0);
    await prisma.product.update({ where: { code: "D400" }, data: { stockUnits: 2, unitPrice: 210 } });
    for (const message of ["continuar compra", "recojo", "confirmar pedido"]) cart = await send(message);
    assert.equal(cart.stage, "REVIEW"); assert.equal(await prisma.order.count(), 0);
    for (const message of ["continuar compra", "recojo", "confirmar pedido", "con Yape"]) cart = await send(message);
    cart = await send("Comprobante de prueba", true);
    assert.equal(cart.stage, "COMPLETE");
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: cart.orderNumber }, include: { items: true } });
    assert.equal(await prisma.order.count(), 1); assert.equal(order.items.length, 2); assert.equal(Number(order.total), 480); assert.equal(order.status, "PENDING"); assert.equal(order.paymentMethod, "Yape"); assert.match(order.adminNotes!, /NO COBRAR NI DESPACHAR/); assert.match(order.adminNotes!, /pago NO validado/);
    assert.deepEqual((await prisma.product.findMany({ where: { code: { in: ["C300", "D400"] } }, orderBy: { code: "asc" }, select: { stockUnits: true } })).map(p => p.stockUnits), [10, 2]);
    const queued = await prisma.chatMessage.count({ where: { conversationId: conversation.id, status: "bc_queued" } });
    for (let i = 0; i < queued; i++) await processBcLivePilot(prisma);
    assert.equal(deliveries, queued); assert.equal(await prisma.chatMessage.count({ where: { conversationId: conversation.id, status: "bc_queued" } }), 0);
    await send("ver carrito"); failTransport = true;
    await processBcLivePilot(prisma); const before = deliveries;
    await processBcLivePilot(prisma); assert.equal(deliveries, before, "Unknown transport outcomes must not retry");
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).botEnabled, false);
    const other = await prisma.chatContact.create({ data: { name: "Not authorized", channel: "WHATSAPP", externalId: "51900000002", phoneNormalized: "51900000002" } });
    const denied = await prisma.conversation.create({ data: { contactId: other.id } });
    const response = await batch(new Request("http://localhost/api/internal/chat/simulator-batch", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY! }, body: JSON.stringify({ conversationId: denied.id, requestId: "unauthorized", messages: [{ type: "TEXT", content: "must not send" }] }) }));
    assert.equal(response.status, 403);
    console.log("PASS: authorized pilot creates one pending multi-line order, rejects changed stock/prices, records unverified voucher, retains ERP stock, atomically queues replies, sends once, pauses uncertain transport, rejects non-allowlisted contact.");
  } finally { globalThis.fetch = savedFetch; await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
