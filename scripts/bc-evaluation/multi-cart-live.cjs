/* eslint-disable @typescript-eslint/no-require-imports -- Explicit simulator-only VPS verification. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { SignJWT } = require('jose');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
assert(process.argv.includes('--execute-simulator'), 'Explicit simulator flag required');
const db = new PrismaClient(), sessionKey = 'cart-' + randomUUID(), results = [];
const expectedExternalId = 'SIMULATOR:' + Array.from(sessionKey).map(c => String.fromCharCode(97 + c.charCodeAt(0) % 26)).join('').slice(0, 80);
let contactId, conversationId, headers;
async function send(content, stage, attachment) {
  const response = await fetch('http://127.0.0.1:4000/api/admin/conversations/simulate', { method: 'POST', headers,
    body: JSON.stringify({ content, sessionKey, name: 'Cliente Prueba Carrito', phone: '+51 999 888 777', ...(attachment ? { attachment } : {}) }), signal: AbortSignal.timeout(20000) });
  const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.automationTriggered, true);
  conversationId = body.conversationId;
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  assert(conversation.contact.externalId === expectedExternalId);
  contactId = conversation.contactId;
  const start = Date.now(); let cart;
  while (Date.now() - start < 60000) {
    const replies = await db.chatMessage.findMany({ where: { conversationId, direction: 'OUTBOUND', createdAt: { gte: new Date(body.pendingSince) } }, orderBy: { createdAt: 'asc' } });
    if (replies.length && replies.length >= (replies[0].metadata?.batchSize || 1)) {
      const agenda = await db.conversationRequestAgenda.findUniqueOrThrow({ where: { conversationId } });
      cart = agenda.state.cart; break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(cart, 'No cart response'); assert.equal(cart.stage, stage);
  results.push({ content, stage: cart.stage, total: cart.total, lines: cart.lines, orderNumber: cart.orderNumber });
  console.log(JSON.stringify({ stage: cart.stage, total: cart.total, lines: cart.lines.length }));
  return cart;
}
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  const jwt = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN', requirePasswordChange: false }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  headers = { 'content-type': 'application/json', Cookie: 'importadora_session=' + jwt };
  assert.equal(await db.product.count({ where: { code: { in: ['N1321', 'O1008'] }, isVisible: true, stockUnits: { gte: 3 } } }), 2, 'Required read-only catalog fixtures unavailable');
  await send('quiero comprar N1321 1 unidad y tambien O1008 1 unidad', 'REVIEW');
  const changed = await send('cambiar N1321 a 2', 'REVIEW');
  assert.equal(changed.lines.find(line => line.code === 'N1321').quantity, 2);
  for (const [text, stage] of [['continuar compra','NAME'],['Cliente Prueba','DOCUMENT'],['boleta','DOCUMENT_NUMBER'],['12345678','DELIVERY'],['recojo','CONFIRM'],['confirmar pedido','PAYMENT'],['Yape','VOUCHER']]) await send(text, stage);
  const completed = await send('Comprobante de prueba', 'COMPLETE', { type: 'IMAGE', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT5sAAAAASUVORK5CYII=' });
  assert.equal(await db.order.count({ where: { orderNumber: completed.orderNumber } }), 0);
  assert.equal(completed.lines.length, 2); assert(completed.voucherMessageId);
  console.log('PASS: admin simulator -> n8n -> multi-cart -> unverified voucher; zero real orders for simulator reference');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  fs.mkdirSync('.cache/bc-evaluation', { recursive: true });
  fs.writeFileSync('.cache/bc-evaluation/multi-cart-live.json', JSON.stringify({ sessionKey, results, passed: !process.exitCode }, null, 2));
  if (contactId) await db.chatContact.deleteMany({ where: { id: contactId, externalId: expectedExternalId } });
  await db.$disconnect(); console.log('Temporary simulator contact removed');
});
