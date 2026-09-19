import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { MultiCart } from "../../src/lib/bc-multi-cart";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(url.pathname.startsWith("/bc_cart_test_") && ["localhost", "127.0.0.1"].includes(url.hostname), "Dedicated disposable database required");
  process.env.N8N_INTERNAL_API_KEY = randomUUID();
  process.env.BC_REQUEST_AGENDA_ENABLED = "true";
  process.env.BC_MULTI_CART_ENABLED = "true";
  process.env.BC_CUSTOMER_MEMORY_ENABLED = "false";
  process.env.FACTURADOR_API_TOKEN = "";
  process.env.FACTURADOR_API_URL = "";
  process.env.PUSHER_APP_ID = "";
  const { prisma } = await import("../../src/lib/prisma");
  const { POST } = await import("../../src/app/api/internal/chat/requests/route");
  try {
    for (const [code, name, stockUnits, price] of [["A100", "PARLANTE PRUEBA", 10, 100], ["B200", "DRON PRUEBA", 2, 200]] as const) {
      await prisma.product.create({ data: { code, name, slug: code.toLowerCase(), stockUnits, unitPrice: price, wholesalePrice: code === "A100" ? 90 : null, wholesaleMinQty: 3, imageUrl: "https://example.test/product.jpg", isVisible: true } });
    }
    const contact = await prisma.chatContact.create({ data: { name: "Cart test", channel: "WHATSAPP", externalId: `SIMULATOR:${randomUUID()}` } });
    const conversation = await prisma.conversation.create({ data: { contactId: contact.id } });
    async function send(content: string, image = false) {
      await prisma.$executeRaw`UPDATE "ChatMessage" SET "createdAt" = "createdAt" - INTERVAL '30 seconds' WHERE "conversationId" = ${conversation.id}`;
      const inbound = await prisma.chatMessage.create({ data: { conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", messageType: image ? "IMAGE" : "TEXT", content, ...(image ? { mediaUrl: "https://example.test/voucher.jpg" } : {}), createdAt: new Date(Date.now() - 15_000) } });
      const request = () => new Request("http://localhost/api/internal/chat/requests", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY! }, body: JSON.stringify({ conversationId: conversation.id, triggerMessageId: inbound.id }) });
      const response = await POST(request()); const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result)); assert.equal(result.handled, true, JSON.stringify(result)); assert.equal(result.skipped, undefined, JSON.stringify(result));
      const count = await prisma.chatMessage.count({ where: { conversationId: conversation.id, direction: "OUTBOUND" } });
      await POST(request());
      assert.equal(await prisma.chatMessage.count({ where: { conversationId: conversation.id, direction: "OUTBOUND" } }), count, "Duplicate trigger cannot duplicate replies or orders");
      const stored = await prisma.conversationRequestAgenda.findUniqueOrThrow({ where: { conversationId: conversation.id } });
      return (stored.state as unknown as { cart: MultiCart }).cart;
    }
    let cart = await send("quiero comprar A100 1 unidad y tambien B200 1 unidad");
    assert.equal(cart.lines.length, 2); assert.equal(cart.total, 300);
    cart = await send("cambiar A100 a 3"); assert.equal(cart.total, 470);
    cart = await send("quitar B200"); assert.equal(cart.total, 270);
    cart = await send("agregar B200 1"); assert.equal(cart.total, 470);
    cart = await send("aceptan yape"); assert.equal(cart.lines.length, 2); assert.equal(cart.total, 470);
    for (const message of ["continuar compra", "Cliente Prueba", "boleta", "12345678", "recojo"]) cart = await send(message);
    assert.equal(cart.stage, "CONFIRM");
    await prisma.product.update({ where: { code: "B200" }, data: { unitPrice: 210 } });
    cart = await send("confirmar pedido"); assert.equal(cart.stage, "REVIEW"); assert.equal(cart.orderNumber, undefined); assert.equal(cart.total, 480);
    for (const message of ["continuar compra", "recojo", "confirmar pedido", "Yape"]) cart = await send(message);
    assert.equal(cart.stage, "VOUCHER");
    cart = await send("Comprobante de prueba", true);
    assert.equal(cart.stage, "COMPLETE"); assert.equal(cart.total, 480);
    assert.equal(await prisma.order.count(), 0);
    assert.deepEqual((await prisma.product.findMany({ orderBy: { code: "asc" }, select: { stockUnits: true } })).map(p => p.stockUnits), [10, 2]);
    console.log("PASS: requests API -> atomic agenda -> multi-item checkout -> reprice -> reconfirm -> unverified voucher; duplicate triggers ignored; zero real orders and unchanged stock");
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
