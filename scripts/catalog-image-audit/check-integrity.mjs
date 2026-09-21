import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.env.CATALOG_AUDIT_DIR || '/home/IMPORTADORA-audits/catalog-images';
const load = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [snapshot, manifest, report] = await Promise.all(['products-snapshot.json','manifest.json','report.json'].map(load));
assert.equal(report.complete, true);
assert.equal(report.scannedPhotos, manifest.photos.length);
const scans = new Map();
for (const line of (await readFile(path.join(root,'ocr.jsonl'),'utf8')).split('\n').filter(Boolean)) { const scan=JSON.parse(line);scans.set(scan.id,scan); }
assert.equal(new Set(manifest.photos.map(p=>p.id)).size,manifest.photos.length);
assert.equal(report.rows.length,manifest.photos.length+manifest.noPhotoProductIds.length);
assert.equal(new Set(report.rows.map(p=>p.id)).size,report.rows.length);
assert.equal(new Set(report.rows.map(p=>p.productId)).size,snapshot.length);
assert.equal(Object.values(report.counts).reduce((a,b)=>a+b,0),report.rows.length);
for (const photo of manifest.photos) {
  const scan=scans.get(photo.id);assert.ok(scan,'Missing photo '+photo.id);
  assert.equal(scan.productId,photo.productId);assert.equal(scan.imageUrl,photo.imageUrl);
  if(scan.status==='SCANNED') {assert.match(scan.sha256,/^[a-f0-9]{64}$/);assert.ok(scan.dimensions.every(n=>n>0));}
}
assert.ok(report.rows.filter(r=>r.status==='CODE_DIFFERENT').every(r=>r.visualReview?.sha256===r.sha256&&r.visualReview.status==='CODE_DIFFERENT'));
assert.equal(report.rows.filter(r=>r.autoStatus==='CODE_DIFFERENT'&&!r.visualReview).length,0,'Unreviewed discrepancy candidate');
const db=new PrismaClient();
try {
  const current=await db.product.findMany({select:{id:true,code:true,name:true,imageUrl:true,localImageUrl:true,sourceImageUrl:true,media:{where:{type:'IMAGE'},select:{url:true}},variants:{select:{name:true,imageUrl:true}}}});
  const signature=p=>JSON.stringify([p.code,p.name,p.imageUrl,p.localImageUrl,p.sourceImageUrl,p.media.map(m=>m.url).sort(),p.variants.map(v=>[v.name,v.imageUrl]).sort()]);
  const byId=new Map(current.map(p=>[p.id,p]));
  const changed=snapshot.filter(p=>!byId.has(p.id)||signature(p)!==signature(byId.get(p.id))).map(p=>p.code);
  const previous=new Set(snapshot.map(p=>p.id));const added=current.filter(p=>!previous.has(p.id)).map(p=>p.code);
  console.log(JSON.stringify({ok:true,complete:true,totalProducts:snapshot.length,photos:manifest.photos.length,successfullyRead:report.scannedPhotos-report.counts.ERROR,errors:report.rows.filter(r=>r.status==='ERROR').map(r=>({code:r.code,reason:r.reason})),noPhotoProducts:manifest.noPhotoProductIds.length,counts:report.counts,visuallyReviewed:report.rows.filter(r=>r.visualReview).length,unreviewedDiscrepancyCandidates:0,currentCatalogChanges:{changed,added},checkedAt:new Date().toISOString()}));
} finally {await db.$disconnect();}
