import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4009';
if (!process.argv.includes('--execute') || !['127.0.0.1', 'localhost', 'tiendavirtualsuper.com'].includes(new URL(base).hostname)) throw new Error('EXPLICIT_STORE_TEST_REQUIRED');
const db = new PrismaClient();
const sessionId = `store-check-${randomUUID()}`;
let cookie = '';
async function send(message, extra = {}) {
  const started = Date.now();
  const response = await fetch(`${base}/api/shop-assistant`, { method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ message, context: { sessionId }, ...extra }), signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  cookie = response.headers.get('set-cookie')?.split(';')[0] || cookie;
  const result = await response.json();
  assert.equal(result.meta.engine, 'ROCKY');
  console.log(JSON.stringify({ intent: result.meta.intent, elapsedMs: Date.now() - started, cards: result.products.length }));
  return result;
}
try {
  const greeting = await send('hola');
  assert.match(greeting.text, /Rocky/);
  const product = await db.product.findFirst({ where: { isVisible: true, stockUnits: { gte: 12 }, code: { startsWith: 'N' } }, select: { code: true } });
  assert.ok(product);
  const exact = await send(`precio ${product.code}`);
  assert.ok(exact.products.some(p => p.code === product.code));
  const follow = await send('quiero 12 unidades');
  assert.ok(follow.products.some(p => p.code === product.code && p.recommendedQuantity === 12));
  const buy = await send('quiero comprarlo');
  assert.match(buy.text, /Agregar/);
  assert.ok(buy.products.some(p => p.code === product.code && p.recommendedQuantity === 12));
  const three = await send('quiero comprar 3 unidades');
  assert.ok(three.products.some(p => p.code === product.code && p.recommendedQuantity === 3));
  const two = await send('quiero 2');
  assert.ok(two.products.some(p => p.code === product.code && p.recommendedQuantity === 2));
  const catalog = await send('catálogo de parlantes');
  assert.ok(catalog.quickActions.some(a => a.label === 'Ver catálogo' && a.href.startsWith('https://tiendavirtualsuper.com/')));
  assert.doesNotMatch(catalog.text, /PDF|adjunt/);
  const human = await send('quiero hablar con un asesor');
  assert.ok(human.quickActions.some(a => a.href.startsWith('https://wa.me/')));
  assert.doesNotMatch(human.text, /registrada|te paso/);
  const invalid = await fetch(`${base}/api/shop-assistant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(invalid.status, 400);
  const oversized = await fetch(`${base}/api/shop-assistant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'a'.repeat(33000) }) });
  assert.equal(oversized.status, 413);
  console.log(JSON.stringify({ ok: true, base, checks: ['greeting', 'product', 'signed-context', 'quantity', 'cart', 'catalog', 'human-link', 'validation', 'body-limit'] }));
} finally { await db.$disconnect(); }
