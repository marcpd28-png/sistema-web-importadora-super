import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
if (!process.argv.includes('--execute')) throw new Error('EXPLICIT_TEST_REQUIRED');
const db = new PrismaClient();
const base = process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4003';
const directory = process.env.ROCKY_PHOTO_EVAL_DIR || '/var/log/rocky/ocr-evaluation';
try {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET_REQUIRED');
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const left = await sharp(`${directory}/photo-8.jpg`).resize({ height: 700 }).toBuffer();
  const right = await sharp(`${directory}/photo-12.jpg`).resize({ height: 700 }).toBuffer();
  const lm = await sharp(left).metadata(), rm = await sharp(right).metadata();
  const combined = await sharp({ create: { width: lm.width + rm.width, height: 700, channels: 3, background: '#fff' } }).composite([{ input: left, left: 0, top: 0 }, { input: right, left: lm.width, top: 0 }]).jpeg().toBuffer();
  const cases = [
    { name: 'reported-BT284', image: await readFile(process.env.ROCKY_PHOTO_PATH || '/var/log/rocky/reported-photo.jpg'), codes: ['BT284'] },
    { name: 'printed-alias', image: await readFile(`${directory}/photo-15.jpg`), codes: ['G15E'] },
    { name: 'variant', image: await readFile(`${directory}/photo-6.jpg`), codes: ['AU147-BLANCO'], choice: true },
    { name: 'collision', image: await readFile(`${directory}/photo-3.jpg`), codes: ['BT23', '07337'], choice: true },
    { name: 'two-products', image: combined, codes: ['B7', 'CP588'] },
  ];
  for (const item of cases) {
    const started = Date.now();
    const response = await fetch(`${base}/api/admin/conversations/simulate`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `importadora_session=${token}` }, body: JSON.stringify({ engine: 'ROCKY', sessionKey: `image-codes-${randomUUID()}`, name: 'Prueba técnica lectura de códigos', content: 'hola me das información de los productos de esta foto', attachment: { type: 'IMAGE', dataUrl: 'data:image/jpeg;base64,' + item.image.toString('base64') } }), signal: AbortSignal.timeout(65000) });
    assert.equal(response.status, 200); const result = await response.json();
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: result.conversationId }, select: { contact: { select: { externalId: true } } } });
    assert.ok(conversation.contact.externalId.startsWith('SIMULATOR:'));
    assert.ok(result.rocky.confidenceEvidence.includes('local-catalog-code-multipass'));
    assert.deepEqual(result.rocky.products.map(p => p.code).sort(), [...item.codes].sort());
    if (item.choice) { assert.match(result.rocky.reply, /Confírmame/); assert.deepEqual(result.rocky.memory.productCodes, []); }
    console.log(JSON.stringify({ name: item.name, ok: true, elapsedMs: Date.now() - started, codes: result.rocky.products.map(p => p.code), reply: result.rocky.reply }));
  }
} finally { await db.$disconnect(); }
