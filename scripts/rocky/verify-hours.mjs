import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if (!process.argv.includes('--execute')) throw new Error('EXPLICIT_TEST_REQUIRED');
const db = new PrismaClient();
try {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  if (!admin || !process.env.AUTH_SECRET) throw new Error('ADMIN_REQUIRED');
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const settings = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 }, select: { supportHours: true } });
  for (const engine of ['ROCKY', 'BC']) {
    const started = Date.now();
    const response = await fetch('https://tiendavirtualsuper.com/api/admin/conversations/simulate', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `importadora_session=${token}` }, body: JSON.stringify({ engine, sessionKey: `hours-regression-${randomUUID()}`, name: 'Prueba técnica horarios', content: 'hora cuales son sus horarios de atencion' }), signal: AbortSignal.timeout(110000) });
    assert.equal(response.status, 200);
    const result = await response.json();
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: result.conversationId }, select: { contact: { select: { externalId: true } } } });
    assert.ok(conversation.contact.externalId.startsWith('SIMULATOR:'));
    let reply = result.rocky?.reply;
    if (engine === 'ROCKY') { assert.equal(result.rocky.intent, 'BUSINESS_QUERY'); assert.deepEqual(result.rocky.toolsRequested, ['getBusinessInfo']); }
    for (let attempt = 0; !reply && attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const message = await db.chatMessage.findFirst({ where: { conversationId: result.conversationId, senderType: 'BOT' }, orderBy: { createdAt: 'desc' }, select: { content: true } });
      reply = message?.content;
    }
    assert.ok(reply?.includes(settings.supportHours), `${engine}: ${reply || 'NO_REPLY'}`);
    assert.doesNotMatch(reply, /marca, el modelo|identificar con certeza/);
    console.log(JSON.stringify({ engine, ok: true, elapsedMs: Date.now() - started, reply }));
  }
} finally { await db.$disconnect(); }
