import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
if (!process.argv.includes('--execute')) throw new Error('EXPLICIT_TEST_REQUIRED');
const db = new PrismaClient();
const base = process.env.ROCKY_TEST_BASE || 'https://tiendavirtualsuper.com';
for (let attempt = 0; attempt < 10; attempt++) {
 try { await fetch(`${base}/api/internal/rocky/health`, { signal: AbortSignal.timeout(1000) }); break; }
 catch { if (attempt === 9) throw new Error('SERVER_NOT_READY'); await new Promise(resolve => setTimeout(resolve, 500)); }
}
try {
 const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
 if (!admin || !process.env.AUTH_SECRET) throw new Error('ADMIN_REQUIRED');
 const token = await new SignJWT({ userId: admin.id, email: admin.email, name: admin.name, role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
 const cases = [{ kind: 'full', content: 'pasame el catalogo completo' }, { kind: 'filtered', content: 'catalogo de parlantes JBL' }];
 if (process.env.ROCKY_PHOTO_PATH) cases.push({ kind: 'photo', content: 'hola estoy buscando este producto', attachment: { type: 'IMAGE', dataUrl: 'data:image/png;base64,' + readFileSync(process.env.ROCKY_PHOTO_PATH).toString('base64') } });
 for (const item of cases) {
  const started = Date.now();
  const response = await fetch(`${process.env.ROCKY_TEST_BASE || 'https://tiendavirtualsuper.com'}/api/admin/conversations/simulate`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `importadora_session=${token}` }, body: JSON.stringify({ engine: 'ROCKY', sessionKey: `catalog-photo-${randomUUID()}`, name: 'Prueba técnica catálogo foto', content: item.content, attachment: item.attachment }), signal: AbortSignal.timeout(65000) });
  assert.equal(response.status, 200);const result=await response.json();
  const conversation=await db.conversation.findUniqueOrThrow({where:{id:result.conversationId},select:{contact:{select:{externalId:true}}}});assert.ok(conversation.contact.externalId.startsWith('SIMULATOR:'));
  if(item.kind==='full'){assert.equal(result.rocky.catalog.scope,'FULL');assert.match(result.rocky.reply,/página web oficial/);assert.equal(result.rocky.products.length,0);}
  if(item.kind==='filtered'){
   const catalog=result.rocky.catalog;assert.ok(catalog.document);const url=new URL(catalog.url);assert.equal(url.searchParams.get('category'),'parlantes');assert.equal(url.searchParams.get('brand'),'JBL');assert.ok(result.messages.some(m=>m.messageType==='DOCUMENT'&&m.mediaUrl===catalog.document.url));
   const pdf=await fetch(catalog.document.url);assert.equal(pdf.status,200);assert.ok(pdf.headers.get('content-type').includes('pdf'));
   const signature=Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString();assert.equal(signature,'%PDF');
   assert.equal((await fetch(catalog.url)).status,200);
  }
  if(item.kind==='photo'){assert.ok(result.rocky.confidenceEvidence.some(e=>e.startsWith('local-tesseract')||e==='catalog-source-image-sha256'));if(process.env.ROCKY_EXPECTED_PHOTO_CODE)assert.deepEqual(result.rocky.products.map(p=>p.code),[process.env.ROCKY_EXPECTED_PHOTO_CODE]);}
  console.log(JSON.stringify({kind:item.kind,ok:true,elapsedMs:Date.now()-started,catalog:result.rocky.catalog,codes:result.rocky.products.map(p=>p.code),reply:result.rocky.reply}));
 }
} finally { await db.$disconnect(); }
