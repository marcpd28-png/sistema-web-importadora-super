import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4026';
if (!process.argv.includes('--execute') || !['127.0.0.1', 'tiendavirtualsuper.com'].includes(new URL(base).hostname)) throw Error('SIMULATOR_ONLY');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasourceUrl: url.toString() });
try {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  assert.ok(admin && process.env.AUTH_SECRET);
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const headers = { 'content-type': 'application/json', cookie: `importadora_session=${token}` };
  let checked = 0;
  for (const content of ['tetera electrica', 'parlante bluetooth', 'audifonos inalambricos', 'microfono inalambrico', 'ventilador', 'lampara']) {
    const count = await db.product.count({ where: { isVisible: true, AND: content.split(' ').map(word => ({ name: { contains: word, mode: 'insensitive' } })) } });
    if (!count) continue;
    const response = await fetch(base + '/api/admin/conversations/simulate', {
      method: 'POST', headers, body: JSON.stringify({ engine: 'ROCKY', sessionKey: `catalog-name-${randomUUID()}`, name: 'Prueba técnica de búsqueda por nombre', content }),
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200);
    const { rocky } = await response.json();
    assert.equal(rocky.intent, 'PRODUCT_SEARCH', content);
    assert.equal(rocky.model, 'rules-and-tools', content);
    assert.ok(rocky.confidenceEvidence.includes('CATALOG_MATCHED_INTENT'), content);
    assert.ok(rocky.products.length > 0, content);
    assert.equal(rocky.toolCalls.filter(call => call.name === 'searchProducts').length, 1);
    assert.doesNotMatch(rocky.reply, /Qué producto buscas/);
    console.log(JSON.stringify({ query: content, codes: rocky.products.map(p => p.code), model: rocky.model }));
    checked++;
  }
  assert.ok(checked >= 4, 'At least four stocked catalog families must be verified');
  const simulate = async (content, sessionKey = `catalog-fragment-${randomUUID()}`) => {
    const response = await fetch(base + '/api/admin/conversations/simulate', {
      method: 'POST', headers, body: JSON.stringify({ engine: 'ROCKY', sessionKey, name: 'Prueba técnica de fragmentos', content }),
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200);
    const { rocky } = await response.json();
    assert.equal(rocky.intent, 'PRODUCT_SEARCH', content);
    assert.ok(rocky.products.length, content);
    console.log(JSON.stringify({ query: content, codes: rocky.products.map(p => p.code) }));
    return rocky;
  };
  for (const typo of ['parlante bluetoth', 'microfono inalambrco']) await simulate(typo);
  const session = `catalog-fragment-${randomUUID()}`;
  await simulate('cargador', session);
  await simulate('Samsung', session);
  const refined = await simulate('25 W', session);
  assert.ok(refined.confidenceEvidence.includes('CATALOG_QUERY_REFINED'));
  assert.ok(refined.products.every(p => /cargador/i.test(p.name) && /samsung/i.test(p.name) && /25\s*w/i.test(p.name)));
  console.log(JSON.stringify({ ok: true, base, checked, customerMessagesSent: 0 }));
} finally { await db.$disconnect(); }
