import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4027';
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
  const sessionKey = `rocky-batch-${randomUUID()}`;
  const send = async content => {
    const response = await fetch(base + '/api/admin/conversations/simulate', {
      method: 'POST', headers, body: JSON.stringify({ engine: 'ROCKY', background: true, sessionKey, name: 'Prueba técnica agrupación Rocky', content }),
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 202);
    return response.json();
  };
  const first = await send('camara');
  const second = await send('espia');
  assert.equal(first.conversationId, second.conversationId);
  let result;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const params = new URLSearchParams({ conversationId: second.conversationId, messageId: second.customerMessageId });
    const response = await fetch(base + `/api/admin/conversations/simulate?${params}`, { headers, signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200);
    result = await response.json();
    if (result.rocky) break;
  }
  assert.ok(result?.rocky, 'Rocky must answer the latest fragment');
  assert.deepEqual(result.rocky.inputMessageIds, [first.customerMessageId, second.customerMessageId]);
  assert.ok(result.rocky.confidenceEvidence.includes('BATCHED_INPUT'));
  assert.equal(result.rocky.intent, 'PRODUCT_SEARCH');
  assert.ok(result.rocky.products.length > 0);
  assert.ok(result.rocky.products.every(product => /camara/i.test(product.name)));
  assert.equal(await db.rockyRun.count({ where: { triggerMessageId: { in: [first.customerMessageId, second.customerMessageId] } } }), 1);
  assert.equal(result.messages.filter(message => message.direction === 'OUTBOUND' && message.senderType === 'BOT').length, 1);
  console.log(JSON.stringify({ ok: true, base, fragments: 2, answerTrigger: second.customerMessageId, customerMessagesSent: 0 }));
} finally {
  await db.$disconnect();
}
