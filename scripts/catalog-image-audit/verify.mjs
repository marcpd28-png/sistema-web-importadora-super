import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
if (!process.argv.includes('--execute')) throw new Error('EXPLICIT_TEST_REQUIRED');
const base = process.env.AUDIT_TEST_BASE || 'http://127.0.0.1:4003';
const db = new PrismaClient();
for (let i = 0; i < 12; i++) {
  try { await fetch(`${base}/api/admin/catalog-image-audit`, { signal: AbortSignal.timeout(1000) }); break; }
  catch { if (i === 11) throw new Error('SERVER_NOT_READY'); await new Promise(resolve => setTimeout(resolve, 500)); }
}
try {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const headers = { cookie: `importadora_session=${token}` };
  assert.equal((await fetch(`${base}/api/admin/catalog-image-audit`)).status, 401);
  const reportResponse = await fetch(`${base}/api/admin/catalog-image-audit?format=json`, { headers });
  assert.equal(reportResponse.status, 200); const report = await reportResponse.json();
  assert.equal(report.totalProducts, 7142); assert.equal(report.totalPhotos, 5917);
  assert.equal(report.rows.length, report.scannedPhotos + report.noPhotoProducts);
  assert.equal(new Set(report.rows.map(row => row.id)).size, report.rows.length);
  assert.ok(report.rows.filter(row => row.status === 'CODE_DIFFERENT').every(row => row.visualReview?.status === 'CODE_DIFFERENT'));
  if (process.env.AUDIT_REQUIRE_COMPLETE === 'true') { assert.equal(report.complete, true); assert.equal(report.scannedPhotos, report.totalPhotos); }
  const csvResponse = await fetch(`${base}/api/admin/catalog-image-audit?format=csv`, { headers }); assert.equal(csvResponse.status, 200); assert.ok((await csvResponse.text()).includes('Código inventario'));
  for (const status of ['CODE_DIFFERENT', 'CODE_MATCH', 'NAME_MATCH', 'UNVERIFIABLE', 'ERROR', 'NO_IMAGE']) {
    const response = await fetch(`${base}/admin/atencion?audit=${status}`, { headers }); assert.equal(response.status, 200);const html = await response.text();
    assert.ok(html.includes('Códigos incongruentes')); assert.ok(html.includes('Descargar CSV completo'));
    for (const asset of [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match => match[1]))]) {
      assert.equal((await fetch(new URL(asset.replaceAll('&amp;', '&'), base), { method: 'HEAD' })).status, 200);
    }
  }
  const image = sharp('/home/IMPORTADORA/public/uploads/products/erp-au30-6e58571c4e56.webp');
  const meta = await image.metadata();
  const photo = await image.extract({ left: 0, top: 100, width: meta.width, height: meta.height - 100 }).jpeg({ quality: 90 }).toBuffer();
  const response = await fetch(`${base}/api/admin/conversations/simulate`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ engine: 'ROCKY', sessionKey: `audit-name-${randomUUID()}`, name: 'Prueba técnica reconocimiento por nombre', content: 'me das información de este producto', attachment: { type: 'IMAGE', dataUrl: 'data:image/jpeg;base64,' + photo.toString('base64') } }), signal: AbortSignal.timeout(65000) });
  assert.equal(response.status, 200); const result = await response.json();
  assert.ok(result.rocky.confidenceEvidence.includes('local-catalog-name-multipass'), JSON.stringify({ evidence: result.rocky.confidenceEvidence, codes: result.rocky.products.map(p => p.code), reply: result.rocky.reply }));
  assert.deepEqual(result.rocky.products.map(p => p.code), ['AU30']);
  assert.match(result.rocky.reply, /nombre/); assert.doesNotMatch(result.rocky.reply, /Leí el código AU30/);
  console.log(JSON.stringify({ ok: true, base, complete: report.complete, totalProducts: report.totalProducts, totalPhotos: report.totalPhotos, scannedPhotos: report.scannedPhotos, counts: report.counts, nameRecognition: { codes: result.rocky.products.map(p => p.code), reply: result.rocky.reply } }));
} finally { await db.$disconnect(); }
