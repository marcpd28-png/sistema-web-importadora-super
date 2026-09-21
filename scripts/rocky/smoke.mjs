import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
const db = new PrismaClient();
const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4003';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || !process.argv.includes('--execute')) throw new Error('LOCAL_SIMULATOR_ONLY');
for (let attempt = 0; attempt < 10; attempt++) {
  try { await fetch(`${base}/api/internal/rocky/health`, { signal: AbortSignal.timeout(1000) }); break; }
  catch { if (attempt === 9) throw new Error('SERVER_NOT_READY'); await new Promise(resolve => setTimeout(resolve, 500)); }
}
const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
if (!admin || !process.env.AUTH_SECRET) throw new Error('ADMIN_REQUIRED');
const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const sessionKey = `rocky-smoke-${randomUUID()}`;
const started = Date.now();
try {
  const response = await fetch(`${base}/api/admin/conversations/simulate`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `importadora_session=${token}` }, body: JSON.stringify({ engine: 'ROCKY', sessionKey, name: 'Prueba técnica ROCKY', content: process.env.ROCKY_SMOKE_MESSAGE || 'Quiero un cargador rápido para Samsung, máximo 60 soles.' }), signal: AbortSignal.timeout(110000) });
  const result = await response.json();
  if (!response.ok || !result.rocky) throw new Error(`SIMULATOR_FAILED_${response.status}`);
  const contact = await db.conversation.findUnique({ where: { id: result.conversationId }, select: { contact: { select: { externalId: true } } } });
  if (!contact?.contact.externalId?.startsWith('SIMULATOR:')) throw new Error('SIMULATOR_ISOLATION_FAILED');
  console.log(JSON.stringify({ ok: true, elapsedMs: Date.now() - started, conversationId: result.conversationId, requestId: result.rocky.rockyRequestId,
    intent: result.rocky.intent, model: result.rocky.model, tools: result.rocky.toolsRequested, reason: result.rocky.reasonCode,
    messages: result.messages.length, reply: result.rocky.reply }, null, 2));
} finally { await db.$disconnect(); }
