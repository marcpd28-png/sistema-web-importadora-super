import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert(process.argv.includes("--execute-local") && ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/bc_goal_/.test(url.pathname), "Requires an isolated local bc_goal_* database and --execute-local");
  process.env.N8N_INTERNAL_API_KEY = randomUUID();
  process.env.ROUTER_V2_DELIVERY_METHODS = "RECOJO,DELIVERY,SHALOM";
  process.env.ROUTER_V2_PAYMENT_METHODS = "Yape,Plin,transferencia";
  const { prisma } = await import("../src/lib/prisma");
  const { POST } = await import("../src/app/api/internal/chat/router-v2/route");
  const run = randomUUID();
  const contacts: string[] = [];
  let productId: string | null = null;
  const initialOrders = await prisma.order.count();
  try {
    const product = await prisma.product.create({ data: { code: `QA${String(Date.now()).slice(-6)}`, slug: `checkout-${run}`, name: "PARLANTE JBL PRUEBA", brand: "JBL", category: "PARLANTES", imageUrl: "https://example.com/speaker.jpg", unitPrice: 50, wholesalePrice: 40, wholesaleMinQty: 3, stockUnits: 12 } });
    productId = product.id;
    const contact = await prisma.chatContact.create({ data: { externalId: `SIMULATOR:${run}`, channel: "WHATSAPP", name: "Cliente", phone: "51999888777" } });
    contacts.push(contact.id);
    const conversation = await prisma.conversation.create({ data: { contactId: contact.id } });
    async function send(content: string, expectedStage?: string, media?: { messageType: string; mediaUrl: string }) {
      await prisma.chatMessage.create({ data: { conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", content, messageType: "TEXT" } });
      const response = await POST(new Request("http://localhost/api/internal/chat/router-v2", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY! }, body: JSON.stringify({ conversationId: conversation.id, content, ...media }) }));
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      const state = await prisma.conversationSalesState.findUnique({ where: { conversationId: conversation.id } });
      console.log(JSON.stringify({ input: content, stage: state?.stage, action: body.nextAction, answer: body.draftText }));
      if (expectedStage) assert.equal(state?.stage, expectedStage, `Input: ${content}; answer: ${body.draftText}`);
      if (body.draftText) await prisma.chatMessage.create({ data: { conversationId: conversation.id, direction: "OUTBOUND", senderType: "BOT", content: body.draftText, status: "sent" } });
      return { body, state };
    }
    await send(product.code, "AWAITING_PURCHASE_CONFIRMATION");
    await send("si", "AWAITING_QUANTITY");
    const priced = await send("3", "AWAITING_PRICE_CONFIRMATION");
    assert.equal(Number(priced.state?.total), 120);
    await send("si", "AWAITING_CUSTOMER_DATA");
    await send("Me llamo María Pérez", "AWAITING_DOCUMENT_TYPE");
    await send("boleta DNI 12345678", "AWAITING_DELIVERY_METHOD");
    const summary = await send("recojo", "AWAITING_ORDER_CONFIRMATION");
    assert.match(summary.body.draftText, /María Pérez/);
    assert.match(summary.body.draftText, /Cantidad: 3/);
    const correctedQuantity = await send("mejor 4", "AWAITING_ORDER_CONFIRMATION");
    assert.equal(correctedQuantity.state?.quantity, 4);
    assert.equal(Number(correctedQuantity.state?.total), 160);
    assert.equal(correctedQuantity.state?.orderNumber, null);
    assert.match(correctedQuantity.body.draftText, /Actualicé la cantidad/);
    assert.match(correctedQuantity.body.draftText, /María Pérez/);
    assert.match(correctedQuantity.body.draftText, /12345678/);
    assert.match(correctedQuantity.body.draftText, /RECOJO/);
    await send("mejor factura", "AWAITING_DOCUMENT_DATA");
    const correctedDocument = await send("20123456789", "AWAITING_ORDER_CONFIRMATION");
    assert.match(correctedDocument.body.draftText, /20123456789/);
    assert.match(correctedDocument.body.draftText, /FACTURA/i);
    assert.match(correctedDocument.body.draftText, /RECOJO/);
    assert.equal(correctedDocument.state?.quantity, 4);
    assert.equal(correctedDocument.state?.orderNumber, null);
    const correctedDni = await send("mi DNI es 87654321", "AWAITING_ORDER_CONFIRMATION");
    assert.match(correctedDni.body.draftText, /87654321/);
    assert.doesNotMatch(correctedDni.body.draftText, /20123456789/);
    await prisma.product.update({ where: { id: product.id }, data: { wholesalePrice: 45 } });
    const changed = await send("confirmo", "AWAITING_ORDER_CONFIRMATION");
    assert.equal(changed.state?.orderNumber, null);
    assert.match(changed.body.draftText, /precio cambió/);
    assert.match(changed.body.draftText, /180\.00/);
    const ordered = await send("confirmo", "AWAITING_PAYMENT_METHOD");
    assert.match(ordered.state?.orderNumber ?? "", /^SIM-/);
    await prisma.product.update({ where: { id: product.id }, data: { wholesalePrice: 60, stockUnits: 0, isVisible: false } });
    const payment = await send("yape", "AWAITING_PAYMENT_CONFIRMATION");
    assert.equal(Number(payment.state?.total), 180, "confirmed order keeps its agreed total despite catalog changes");
    assert.equal(payment.state?.selectedProductCode, product.code);
    assert.equal(payment.state?.orderNumber, ordered.state?.orderNumber);
    const voice = await send("ya pague", "AWAITING_PAYMENT_CONFIRMATION", { messageType: "AUDIO", mediaUrl: "https://example.com/audio.ogg" });
    assert.equal((voice.state?.paymentData as { evidenceReceived?: boolean })?.evidenceReceived, false);
    const receipt = await send("comprobante", "AWAITING_PAYMENT_CONFIRMATION", { messageType: "IMAGE", mediaUrl: "https://example.com/receipt.png" });
    assert.equal((receipt.state?.paymentData as { evidenceReceived?: boolean })?.evidenceReceived, true);
    assert.equal((receipt.state?.paymentData as { verified?: boolean })?.verified, false);
    assert.equal(await prisma.order.count(), initialOrders, "simulator must never create real orders");
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockUnits, 0);
    console.log("PASS: actual router handler + PostgreSQL, product-to-receipt checkout, wholesale total, no real orders or stock changes");
  } finally {
    await prisma.chatContact.deleteMany({ where: { id: { in: contacts }, externalId: { startsWith: "SIMULATOR:" } } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId, slug: `checkout-${run}` } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
