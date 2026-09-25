import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4008';
if (!process.argv.includes('--execute') || !['127.0.0.1', 'tiendavirtualsuper.com'].includes(new URL(base).hostname)) throw new Error('SIMULATOR_ONLY');
const db = new PrismaClient();
try {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  assert.ok(admin && process.env.AUTH_SECRET);
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const headers = { 'content-type': 'application/json', cookie: `importadora_session=${token}` };
  const candidates = await db.product.findMany({ where: { isVisible: true, stockUnits: { gte: 2 }, unitPrice: { gt: 0 } }, select: { code: true, imageUrl: true, localImageUrl: true }, take: 300 });
  const product = candidates.find(p => /^[A-Z]{1,8}\d{2,8}[A-Z]?$/.test(p.code) && (p.localImageUrl || p.imageUrl));
  assert.ok(product, 'No suitable published product for test');
  const sessionKey = `sales-smoke-${randomUUID()}`;
  let turns = 0;
  async function send(content, attachment) {
    const response = await fetch(`${base}/api/admin/conversations/simulate`, { method: 'POST', headers,
      body: JSON.stringify({ engine: 'ROCKY', sessionKey, name: 'Prueba técnica ventas', content, attachment }), signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200, `Turn ${++turns} status ${response.status}`);
    const data = await response.json();
    assert.equal(data.rocky.requiresHuman, false, data.rocky.reasonCode);
    assert.equal(data.rocky.finalAction, 'SIMULATE');
    return data;
  }
  const photo = await send(`foto ${product.code}`);
  assert.ok(photo.messages.some(m => m.messageType === 'IMAGE' && m.direction === 'OUTBOUND'), 'Photo missing');
  let data = await send('quiero comprar 2 unidades');
  assert.equal(data.rocky.memory.cart.stage, 'NAME');
  const total = data.rocky.memory.cart.total;
  for (const content of ['gracias', 'un momento', 'confirmar pedido']) {
    data = await send(content);
    assert.equal(data.rocky.memory.cart.stage, 'NAME');
    assert.equal(data.rocky.memory.cart.name, undefined);
    assert.match(data.rocky.reply, /nombre/);
  }
  data = await send('¿Cuál es su horario?');
  assert.equal(data.rocky.memory.cart.stage, 'NAME');
  assert.match(data.rocky.reply, /nombre/);
  for (const [content, stage] of [['me llamo Cliente Prueba', 'DOCUMENT'], ['boleta 12345678', 'DELIVERY'], ['recojo', 'CONFIRM'], ['confirmar pedido', 'PAYMENT'], ['Yape', 'VOUCHER']]) {
    data = await send(content);
    assert.equal(data.rocky.memory.cart.stage, stage);
    assert.equal(data.rocky.memory.cart.total, total);
    assert.equal(data.rocky.memory.cart.name, 'Cliente Prueba');
  }
  const reference = data.rocky.memory.cart.orderNumber;
  assert.match(reference, /^SIM-CART-/);
  data = await send('comprobante de prueba', { type: 'IMAGE', name: 'prueba.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=' });
  assert.equal(data.rocky.memory.cart.stage, 'COMPLETE');
  assert.match(data.rocky.reply, /pago no verificado/);
  assert.equal(await db.order.count({ where: { orderNumber: reference } }), 0);
  console.log(JSON.stringify({ ok: true, base, turns, photo: true, preservedCart: true, stage: 'COMPLETE', realOrderCreated: false, paymentVerified: false }));
} finally { await db.$disconnect(); }
