import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const db = new PrismaClient({ log: [] }); // Existing local source: read-only admin lookup.
assert.equal(new URL(process.env.DATABASE_URL).hostname, '127.0.0.1');
const base = 'http://127.0.0.1:3101'; // Only start-local-validation.ps1's isolated server.
const path = 'docs/rocky/activation-real-20260926/runtime-evidence.json';
try {
  const evidence = JSON.parse(await readFile(path, 'utf8'));
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  assert.ok(admin && process.env.AUTH_SECRET, 'EXISTING_LOCAL_ADMIN_REQUIRED');
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const headers = { 'content-type': 'application/json', origin: base, cookie: `importadora_session=${token}` };
  const row = evidence.turns.find(t => t.result?.rockyRequestId === evidence.modelTurn.rockyRequestId);
  const start = performance.now();
  const response = await fetch(`${base}/api/admin/rocky`, { method: 'POST', headers, body: JSON.stringify({ action: 'feedback', runId: evidence.modelTurn.rockyRequestId, feedback: 'EDITED', humanResponse: '¡Hola! Te ayudo a elegir entre los productos disponibles.' }), signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.difference.humanEdited, true);
  const read = await fetch(`${base}/api/admin/rocky?conversationId=${row.conversationId}`, { headers, signal: AbortSignal.timeout(60000) });
  assert.equal(read.status, 200);
  const result = await read.json();
  assert.ok(result.runs.some(r => r.id === evidence.modelTurn.rockyRequestId && r.feedback.some(f => f.id === saved.id)));
  evidence.httpFeedback = { postStatus: response.status, readStatus: read.status, persistedFeedbackId: saved.id, humanEdited: saved.difference.humanEdited, ms: performance.now() - start, readBackVerified: true };
  await writeFile(path, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence.httpFeedback));
} finally { await db.$disconnect(); }
