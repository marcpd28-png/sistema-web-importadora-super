import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert(process.argv.includes("--execute-local") && ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/bc_goal_/.test(url.pathname), "Requires --execute-local and an isolated local bc_goal_* database");
  process.env.BC_CUSTOMER_MEMORY_ENABLED = "true";
  process.env.BC_REQUEST_AGENDA_ENABLED = "true";
  process.env.N8N_INTERNAL_API_KEY = randomUUID();
  process.env.FACTURADOR_API_TOKEN = "";
  process.env.FACTURADOR_API_URL = "";
  process.env.PUSHER_APP_ID = "";
  const { prisma } = await import("../../src/lib/prisma");
  const { POST } = await import("../../src/app/api/internal/chat/requests/route");
  const contacts: string[] = [];
  const products: string[] = [];
  const run = randomUUID();
  async function customer() {
    const row = await prisma.chatContact.create({ data: { name: "Memory integration", externalId: `SIMULATOR:${randomUUID()}`, channel: "WHATSAPP" } });
    contacts.push(row.id); return row.id;
  }
  async function conversation(contactId: string) {
    return prisma.conversation.create({ data: { contactId, status: "AUTOMATICO", botEnabled: true } });
  }
  async function send(conversationId: string, content: string | string[]) {
    // Age only this fixture's timeline to exercise the production quiet-period gate without sleeping.
    const history = await prisma.chatMessage.findMany({ where: { conversationId } });
    for (const row of history) await prisma.chatMessage.update({ where: { id: row.id }, data: { createdAt: new Date(row.createdAt.getTime() - 30000) } });
    const parts = typeof content === "string" ? [content] : content;
    const inbound = [];
    const started = Date.now() - 15000 - parts.length;
    for (const [index, part] of parts.entries()) inbound.push(await prisma.chatMessage.create({ data: { conversationId, direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", content: part, createdAt: new Date(started + index) } }));
    const message = inbound.at(-1)!;
    const response = await POST(new Request("http://localhost/api/internal/chat/requests", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY! }, body: JSON.stringify({ conversationId, triggerMessageId: message.id }) }));
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.handled, true, JSON.stringify(body));
    assert.equal(body.skipped, undefined, JSON.stringify(body));
    const replies = await prisma.chatMessage.findMany({ where: { conversationId, direction: "OUTBOUND", createdAt: { gte: message.createdAt } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return replies.map(row => row.content).join("\n");
  }
  try {
    const product = await prisma.product.create({ data: { code: `QA${Date.now()}`, slug: `memory-${run}`, name: "VENTILADOR DE PRUEBA", imageUrl: "https://example.com/ventilador.jpg", unitPrice: 37, stockUnits: 10, isVisible: true } });
    products.push(product.id);
    const grouped = await conversation(await customer());
    const ordered = await send(grouped.id, [`precio ${product.code}`, "seis unidades", `stock ${product.code}`, "aceptan yape", "envíos a Arequipa"]);
    assert.match(ordered, /6 unidad\(es\): S\/ 37\.00/);
    assert(ordered.indexOf("Total:") < ordered.indexOf("Métodos de pago:"));
    assert(ordered.indexOf("Métodos de pago:") < ordered.indexOf("Modalidades de entrega:"));
    const savedAgenda = await prisma.conversationRequestAgenda.findUniqueOrThrow({ where: { conversationId: grouped.id } });
    assert.deepEqual((savedAgenda.state as { requests: { kind: string }[] }).requests.map(job => job.kind), ["PRICE", "STOCK", "PAYMENT", "SHIPPING"]);
    const contactId = await customer();
    const first = await conversation(contactId);
    await send(first.id, "precio del sopladorcito");
    const corrected = await send(first.id, `me refiero a ${product.code}`);
    assert.match(corrected, /37\.00/);
    const learned = await prisma.customerConversationMemory.findUniqueOrThrow({ where: { contactId } });
    assert.match(JSON.stringify(learned.state), /sopladorcito/);
    // A new session must read persisted memory, while the amount comes from live inventory.
    await prisma.product.update({ where: { id: product.id }, data: { unitPrice: 49 } });
    const second = await conversation(contactId);
    const recalled = await send(second.id, "precio del sopladorcito");
    assert.match(recalled, /Antes me confirmaste/);
    assert.match(recalled, /49\.00/);
    assert.doesNotMatch(recalled, /37\.00/);
    const mixedMemory = await conversation(contactId);
    const orderedMemory = await send(mixedMemory.id, ["aceptan yape", "precio del sopladorcito", "seis unidades", "envíos a Arequipa", "gracias"]);
    assert(orderedMemory.indexOf("Métodos de pago:") < orderedMemory.indexOf("Antes me confirmaste"), "memory explanation must not jump ahead of the first customer question");
    assert(orderedMemory.indexOf("Antes me confirmaste") < orderedMemory.indexOf("Total:"));
    assert(orderedMemory.indexOf("Total:") < orderedMemory.indexOf("Modalidades de entrega:"));
    const stranger = await conversation(await customer());
    assert.doesNotMatch(await send(stranger.id, "precio del sopladorcito"), /Antes me confirmaste|49\.00/);
    await prisma.digitalProductProfile.create({ data: { productId: product.id, status: "PUBLICADA" } });
    const specification = await prisma.productSpecification.create({ data: { productId: product.id, name: "Autonomía", value: "7 horas" } });
    const questions = await conversation(contactId);
    assert.match(await send(questions.id, `informacion ${product.code} autonomia`), /7 horas/);
    assert.match(await send(questions.id, `informacion ${product.code} autonomia`), /7 horas/);
    await prisma.productSpecification.update({ where: { id: specification.id }, data: { value: "9 horas" } });
    const nextVisit = await conversation(contactId);
    const personalized = await send(nextVisit.id, product.code);
    assert.match(personalized, /9 horas/, "frequent technical questions are answered proactively from current facts");
    assert.doesNotMatch(personalized, /7 horas/);
    const faqMemory = await prisma.customerConversationMemory.findUniqueOrThrow({ where: { contactId } });
    const faqState = faqMemory.state as { questions: { kind: string; count: number }[] };
    assert.equal(faqState.questions.find(question => question.kind === "INFORMATION")?.count, 2, "proactive replies do not invent new customer questions");
    await prisma.product.update({ where: { id: product.id }, data: { isVisible: false } });
    const third = await conversation(contactId);
    assert.doesNotMatch(await send(third.id, "precio del sopladorcito"), /Antes me confirmaste|49\.00/);
    await prisma.chatContact.delete({ where: { id: contactId } });
    assert.equal(await prisma.customerConversationMemory.findUnique({ where: { contactId } }), null);
    console.log("PASS: PostgreSQL memory migration, confirmed correction, cross-session recall, fresh price, learned FAQs with current specifications, no feedback loop, contact isolation, hidden SKU exclusion and cascade deletion");
  } finally {
    await prisma.chatContact.deleteMany({ where: { id: { in: contacts }, name: "Memory integration" } });
    await prisma.product.deleteMany({ where: { id: { in: products }, slug: `memory-${run}` } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
