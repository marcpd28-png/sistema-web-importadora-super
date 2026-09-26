import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4025';
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
  const sessionKey = `camera-search-${randomUUID()}`;
  let turns = 0;
  for (const content of ['hola', 'camara espia', 'camara espia', 'cámara espía', 'cámaras espías']) {
    const response = await fetch(base + '/api/admin/conversations/simulate', {
      method: 'POST', headers, body: JSON.stringify({ engine: 'ROCKY', sessionKey, name: 'Prueba técnica de búsqueda de cámaras', content }),
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200);
    const { rocky } = await response.json();
    assert.ok(rocky);
    if (content !== 'hola') {
      assert.equal(rocky.intent, 'PRODUCT_SEARCH');
      assert.equal(rocky.model, 'rules-and-tools');
      assert.ok(rocky.toolCalls.some(call => call.name === 'searchProducts' && call.ok));
      assert.ok(rocky.products.some(p => p.code === 'N437'));
      assert.ok(rocky.products.every(p => /espi/i.test(p.name)));
      assert.doesNotMatch(rocky.reply, /Qué producto buscas/);
      console.log(JSON.stringify({ query: content, codes: rocky.products.map(p => p.code), model: rocky.model }));
    }
    turns++;
  }
  console.log(JSON.stringify({ ok: true, base, turns, customerMessagesSent: 0 }));
} finally { await db.$disconnect(); }
