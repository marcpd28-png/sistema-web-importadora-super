/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS CLI, also run from private VPS backup directories via NODE_PATH. */
/* Run only against the admin simulator. Never invokes a customer delivery endpoint. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { SignJWT } = require('jose');
require('@next/env').loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
if (!args.includes('--execute-simulator')) {
  console.error('Explicit --execute-simulator required. Creates temporary SIMULATOR contacts and deletes only those contacts afterwards.');
  process.exit(2);
}
const option = (name, fallback) => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1) || fallback;
const output = path.resolve(option('--output', '.cache/bc-evaluation/run.json'));
const corpus = JSON.parse(fs.readFileSync(path.resolve(option('--corpus', path.join(__dirname, 'cases.json'))), 'utf8'));
const selected = new Set(option('--cases', '').split(',').filter(Boolean));
const cases = corpus.cases.filter(item => !selected.size || selected.has(item.id));
const origin = new URL(option('--origin', 'http://127.0.0.1:4000')).origin;
const concurrency = Math.max(1, Math.min(3, Number(option('--concurrency', '2')) || 2));
const timeoutMs = Math.max(15000, Math.min(180000, Number(option('--timeout-ms', '90000')) || 90000));
const db = new PrismaClient();
const runId = 'BC-EVAL-' + randomUUID();
const owned = new Set();
const results = [];
const run = { version: 1, runId, startedAt: new Date().toISOString(), corpusVersion: corpus.version, concurrency, timeoutMs, results };
let headers;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function save() { fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 }); fs.writeFileSync(output, JSON.stringify(run, null, 2), { mode: 0o600 }); }

async function execute(item) {
  const result = { id: item.id, sourceGroup: item.sourceGroup, startedAt: new Date().toISOString() };
  const sessionKey = 'eval-' + randomUUID();
  let last, conversationId;
  try {
    for (const content of item.messages) {
      const response = await fetch(origin + '/api/admin/conversations/simulate', {
        method: 'POST', headers,
        body: JSON.stringify({ content, sessionKey, name: runId, phone: '+51 999 888 777' }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error('SIMULATOR_HTTP_' + response.status);
      last = await response.json();
      conversationId = last.conversationId;
      if (conversationId) owned.add(conversationId);
      if (!last.automationTriggered) throw new Error('SIMULATOR_AUTOMATION_NOT_TRIGGERED');
    }
    const ownedConversation = await db.conversation.findFirst({ where: { id: conversationId, contact: { name: runId, externalId: { startsWith: 'SIMULATOR:' } } }, select: { id: true } });
    if (!ownedConversation) throw new Error('SIMULATOR_OWNERSHIP_GUARD');
    const started = Date.now(); let rows = [];
    while (Date.now() - started < timeoutMs) {
      rows = await db.chatMessage.findMany({ where: { conversationId, direction: 'OUTBOUND', senderType: 'BOT', createdAt: { gte: new Date(last.pendingSince) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, content: true, messageType: true, mediaUrl: true, metadata: true, createdAt: true } });
      if (rows.length && (!rows[0].metadata?.batchSize || rows.length >= rows[0].metadata.batchSize)) break;
      await pause(1000);
    }
    result.transport = rows.length ? 'ANSWERED' : 'TIMEOUT';
    result.latencyMs = rows.length ? rows[0].createdAt - new Date(last.pendingSince) : null;
    result.messages = rows;
    const state = await db.conversation.findUnique({ where: { id: conversationId }, select: {
      status: true, botEnabled: true, requestAgenda: { select: { revision: true, state: true } },
      salesState: { select: { stage: true, selectedProductCode: true, shownProducts: true, quantity: true, unitPrice: true, total: true } },
      messages: { where: { direction: 'INBOUND' }, select: { content: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    } });
    result.state = state;
    result.inboundComplete = item.messages.every(text => state.messages.some(message => message.content === text));
    result.pdfChecks = [];
    for (const row of rows.filter(message => message.messageType === 'DOCUMENT' && message.mediaUrl)) {
      const url = new URL(row.mediaUrl);
      // Only read documents hosted by this application, never customer-provided links.
      if (!['tiendavirtualsuper.com', 'www.tiendavirtualsuper.com', new URL(origin).hostname].includes(url.hostname) || !url.pathname.startsWith('/uploads/catalogs/')) {
        result.pdfChecks.push({ ok: false, reason: 'UNEXPECTED_CATALOG_URL' }); continue;
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const reader = response.body?.getReader(); const first = await reader?.read(); await reader?.cancel();
        result.pdfChecks.push({ ok: response.ok && Buffer.from(first?.value || []).subarray(0, 5).toString() === '%PDF-', httpStatus: response.status });
      } catch { result.pdfChecks.push({ ok: false, reason: 'CATALOG_READ_FAILED' }); }
    }
    result.conversationId = conversationId;
  } catch (error) {
    result.transport = 'ERROR'; result.error = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    if (conversationId) result.conversationId = conversationId;
  }
  results.push(result); save();
  console.log(JSON.stringify({ completed: results.length, total: cases.length, case: item.id, transport: result.transport, latencyMs: result.latencyMs, documents: result.pdfChecks?.length || 0 }));
}

(async () => {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  if (!admin || !process.env.AUTH_SECRET) throw new Error('ADMIN_SIMULATOR_AUTH_NOT_CONFIGURED');
  const jwt = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN', requirePasswordChange: false })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('90m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  headers = { 'content-type': 'application/json', Cookie: 'importadora_session=' + jwt };
  let index = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (index < cases.length) { const item = cases[index++]; await execute(item); } }));
  // Allow superseded n8n workers to finish before checking duplicate/late replies and cleanup.
  await pause(15000);
  for (const result of results.filter(item => item.conversationId)) {
    const count = await db.chatMessage.count({ where: { conversationId: result.conversationId, direction: 'OUTBOUND', senderType: 'BOT' } });
    result.lateOrExtraReplies = Math.max(0, count - (result.messages?.length || 0));
  }
  run.completedAt = new Date().toISOString(); save();
})().catch(error => { run.error = error instanceof Error ? error.message : 'UNKNOWN_ERROR'; save(); console.error(run.error); process.exitCode = 1; }).finally(async () => {
  const contacts = await db.chatContact.findMany({ where: { name: runId, externalId: { startsWith: 'SIMULATOR:' }, conversations: { some: { id: { in: [...owned] } } } }, select: { id: true } });
  const deleted = contacts.length ? await db.chatContact.deleteMany({ where: { id: { in: contacts.map(contact => contact.id) }, name: runId, externalId: { startsWith: 'SIMULATOR:' } } }) : { count: 0 };
  run.cleanup = { temporaryContactsDeleted: deleted.count, remaining: await db.chatContact.count({ where: { name: runId, externalId: { startsWith: 'SIMULATOR:' } } }) };
  save(); await db.$disconnect(); console.log(JSON.stringify({ finished: true, cases: results.length, cleanup: run.cleanup }));
});
