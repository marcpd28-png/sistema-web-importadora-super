import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

// Creates simulator records only. Run against the release under test before switching traffic.
const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4004';
if (!process.argv.includes('--execute') || !['127.0.0.1', 'localhost', 'tiendavirtualsuper.com'].includes(new URL(base).hostname)) throw new Error('EXPLICIT_SIMULATOR_TEST_REQUIRED');
const db = new PrismaClient();
try {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  assert.ok(admin && process.env.AUTH_SECRET);
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const headers = { 'content-type': 'application/json', cookie: `importadora_session=${token}` };
  const started = Date.now();
  const response = await fetch(`${base}/api/admin/conversations/simulate`, {
    method: 'POST', headers, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ engine: 'ROCKY', background: true, sessionKey: `async-check-${randomUUID()}`, name: 'Prueba técnica de espera', content: process.env.ROCKY_SMOKE_MESSAGE || 'catálogo de audífonos' }),
  });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  assert.ok(accepted.customerMessageId && accepted.conversationId);
  assert.ok(accepted.messages.some(m => m.id === accepted.customerMessageId));
  console.log(JSON.stringify({ accepted: true, elapsedMs: Date.now() - started }));
  const params = new URLSearchParams({ conversationId: accepted.conversationId, messageId: accepted.customerMessageId });
  const statusUrl = `${base}/api/admin/conversations/simulate?${params}`;
  const unauthorized = await fetch(statusUrl, { redirect: 'manual' });
  assert.notEqual(unauthorized.status, 200);
  let pendingSeen = false;
  for (;;) {
    const status = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(15000) });
    assert.equal(status.status, 200);
    const result = await status.json();
    if (result.rocky) {
      assert.ok(result.messages.some(m => m.senderType === 'BOT'));
      for (const message of result.messages.filter(m => m.messageType === 'DOCUMENT')) {
        const file = await fetch(message.mediaUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        assert.equal(file.status, 200);
      }
      console.log(JSON.stringify({ completed: true, pendingSeen, elapsedMs: Date.now() - started, intent: result.rocky.intent,
        messages: result.messages.length, documents: result.messages.filter(m => m.messageType === 'DOCUMENT').length }));
      break;
    }
    pendingSeen = true;
    assert.ok(Date.now() - started < 600000, 'Background response did not complete in 10 minutes');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
} finally { await db.$disconnect(); }
