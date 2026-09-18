/* eslint-disable @typescript-eslint/no-require-imports -- VPS simulator verification CLI. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { SignJWT } = require('jose');
require('@next/env').loadEnvConfig(process.cwd());
assert(process.argv.includes('--execute-simulator'), 'Explicit --execute-simulator required');
const db = new PrismaClient();
const sessionKey = 'checkout-' + randomUUID();
const results = [];
let contactId, conversationId, headers;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function send(content, stage, attachment) {
  const r = await fetch('http://127.0.0.1:4000/api/admin/conversations/simulate', {
    method: 'POST', headers, body: JSON.stringify({ content, sessionKey, name: 'Cliente', phone: '+51 999 888 777', ...(attachment ? { attachment } : {}) }), signal: AbortSignal.timeout(20000),
  });
  const body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.automationTriggered, true);
  conversationId = body.conversationId;
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  assert(conversation.contact.externalId.startsWith('SIMULATOR:'));
  contactId = conversation.contactId;
  const started = Date.now(); let replies = [];
  while (Date.now() - started < 90000) {
    replies = await db.chatMessage.findMany({ where: { conversationId, direction: 'OUTBOUND', senderType: 'BOT', createdAt: { gte: new Date(body.pendingSince) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    if (replies.length && (!replies[0].metadata?.batchSize || replies.length >= replies[0].metadata.batchSize)) break;
    await pause(1000);
  }
  assert(replies.length, 'No response to ' + content);
  const state = await db.conversationSalesState.findUniqueOrThrow({ where: { conversationId } });
  const answer = replies.map(row => row.content).join('\n');
  if (results.length) assert.doesNotMatch(answer, /¡Buen(?:os días|as tardes|as noches)!/i, 'Do not greet again at each checkout step');
  results.push({ content, stage: state.stage, answer }); console.log(JSON.stringify(results.at(-1)));
  assert.equal(state.stage, stage, answer);
  return state;
}
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  const jwt = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN', requirePasswordChange: false })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('20m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  headers = { 'content-type': 'application/json', Cookie: 'importadora_session=' + jwt };
  // A known available item from the grouped-message verification; inventory is only read.
  const product = await db.product.findFirstOrThrow({ where: { code: 'N1321', isVisible: true, stockUnits: { gte: 3 } }, select: { code: true } });
  await send(product.code, 'AWAITING_PURCHASE_CONFIRMATION');
  await send('si', 'AWAITING_QUANTITY');
  await send('¿Hacen envíos a Arequipa?', 'AWAITING_QUANTITY');
  await send('2', 'AWAITING_PRICE_CONFIRMATION');
  const afterPaymentQuestion = await send('¿Aceptan Yape?', 'AWAITING_PRICE_CONFIRMATION');
  assert.equal(afterPaymentQuestion.quantity, 2);
  await send('si', 'AWAITING_CUSTOMER_DATA');
  await send('Me llamo Cliente Prueba', 'AWAITING_DOCUMENT_TYPE');
  await send('boleta DNI 12345678', 'AWAITING_DELIVERY_METHOD');
  await send('recojo', 'AWAITING_ORDER_CONFIRMATION');
  const corrected = await send('mejor 3', 'AWAITING_ORDER_CONFIRMATION');
  assert.equal(corrected.quantity, 3); assert.equal(corrected.customerData.name, 'Cliente Prueba');
  const ordered = await send('confirmo', 'AWAITING_PAYMENT_METHOD');
  assert.match(ordered.orderNumber, /^SIM-/);
  await send('yape', 'AWAITING_PAYMENT_CONFIRMATION');
  const paid = await send('comprobante de prueba', 'AWAITING_PAYMENT_CONFIRMATION', { type: 'IMAGE', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT5sAAAAASUVORK5CYII=' });
  assert.equal(paid.paymentData.evidenceReceived, true); assert.equal(paid.paymentData.verified, false);
  assert.equal(await db.order.count({ where: { orderNumber: ordered.orderNumber } }), 0);
  console.log('PASS: admin simulator → n8n → checkout → unverified receipt, no real order');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  fs.mkdirSync('.cache/bc-evaluation', { recursive: true });
  fs.writeFileSync('.cache/bc-evaluation/checkout-live.json', JSON.stringify({ sessionKey, results, passed: !process.exitCode }, null, 2));
  if (contactId) await db.chatContact.deleteMany({ where: { id: contactId, externalId: { startsWith: 'SIMULATOR:' } } });
  await db.$disconnect(); console.log('Temporary simulator contact removed');
});
