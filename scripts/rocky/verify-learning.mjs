import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {SignJWT} from 'jose';

const base=process.env.ROCKY_TEST_BASE || 'http://127.0.0.1:4015';
if(!process.argv.includes('--execute') || !['127.0.0.1','tiendavirtualsuper.com'].includes(new URL(base).hostname)) throw Error('SIMULATOR_ONLY');
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');
const db=new PrismaClient({datasourceUrl:url.toString()});
let ownFeedbackId;
try {
 const admin=await db.user.findFirst({where:{role:'ADMIN'},select:{id:true,email:true,name:true}});
 assert.ok(admin && process.env.AUTH_SECRET);
 const token=await new SignJWT({userId:admin.id,email:admin.email,name:admin.name,role:'ADMIN'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
 const cookie=`importadora_session=${token}`;
 const headers={'content-type':'application/json',cookie};
 let last;let turns=0;
 for(const content of ['tendra catalogo','catálogo xfavor','catálogo actualizado','Precio','Buenas tardes quería saber cuánto está el Samsung S24 Ultra','DIRECCION y HORARIO']) {
  const response=await fetch(base+'/api/admin/conversations/simulate',{method:'POST',headers,body:JSON.stringify({engine:'ROCKY',sessionKey:`learning-${randomUUID()}`,name:'Prueba técnica de aprendizaje',content}),signal:AbortSignal.timeout(60000)});
  assert.equal(response.status,200);const data=await response.json();last=data.rocky;turns++;
  assert.ok((content==='Precio'||content.includes('S24')?['SIMULATE','HANDOFF']:['SIMULATE']).includes(last.finalAction),`${content}: ${last.finalAction} ${last.reasonCode}`);
  if(content.toLowerCase().includes('catalog')) { assert.equal(last.catalog.scope,'FULL');assert.doesNotMatch(last.reply,/tetera/i); }
  if(content==='Precio') assert.equal(last.products.length,0);
  if(content.includes('S24')) assert.ok(last.products.every(p=>!/^\([^)]*\)\s*CABLE|^CABLE/i.test(p.name)));
  if(content==='DIRECCION y HORARIO') {
   const settings=await db.storeSettings.findUnique({where:{id:1},select:{supportHours:true,storeAddress:true}});
   assert.ok(last.reply.includes(settings.supportHours));assert.ok(last.reply.includes(settings.storeAddress));
  }
 }
 const correction=await fetch(base+'/api/admin/rocky',{method:'POST',headers,body:JSON.stringify({action:'feedback',runId:last.rockyRequestId,humanResponse:'Ejemplo técnico de revisión. Descartar: no es una política comercial.'})});
 assert.equal(correction.status,200);const feedback=await correction.json();ownFeedbackId=feedback.id;
 const page=await fetch(base+'/admin/rocky/aprendizaje',{headers:{cookie}});assert.equal(page.status,200);
 const html=await page.text();assert.ok(html.includes('Mejorar las respuestas de Rocky'),`Page ${page.url}: ${html.match(/<title>(.*?)<\/title>/)?.[1]}, password=${html.includes('contraseña')}, headings=${JSON.stringify([...html.matchAll(/<h[12][^>]*>([^<]*)<\/h[12]>/g)].map(m=>m[1]))}`);
 const reviewForm=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m=>m[0]).find(form=>form.includes(`value="${feedback.id}"`));
 assert.ok(reviewForm,'Test feedback not present in review queue');
 const action=reviewForm.match(/name="(\$ACTION_ID_[^"]+)"/);assert.ok(action,'Server action missing');
 const form=new FormData();form.set(action[1],'');form.set('id',feedback.id);form.set('status','APPROVED_FOR_EVALUATION');
 const review=await fetch(base+'/admin/rocky/aprendizaje',{method:'POST',headers:{cookie,origin:base},body:form});assert.ok(review.ok);
 assert.equal((await db.rockyFeedback.findUnique({where:{id:feedback.id}})).status,'APPROVED_FOR_EVALUATION');
 async function submitOwnExample(expectedStatus,fields={}) {
  const response=await fetch(base+'/admin/rocky/aprendizaje',{headers:{cookie}});assert.ok(response.ok);
  const html=await response.text();const ownForm=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m=>m[0]).find(f=>f.includes(`value="${feedback.id}"`));assert.ok(ownForm);
  const action=ownForm.match(/name="(\$ACTION_ID_[^"]+)"/);assert.ok(action);
  const body=new FormData();body.set(action[1],'');body.set('id',feedback.id);for(const [key,value] of Object.entries(fields))body.set(key,value);
  assert.ok((await fetch(base+'/admin/rocky/aprendizaje',{method:'POST',headers:{cookie,origin:base},body})).ok);
  assert.equal((await db.rockyFeedback.findUnique({where:{id:feedback.id}})).status,expectedStatus);
 }
 await submitOwnExample('APPROVED_FOR_PLANNING',{intent:'BUSINESS_QUERY'});
 assert.equal((await db.rockyFeedback.findUnique({where:{id:feedback.id}})).outcome,'PLANNER:BUSINESS_QUERY');
 await submitOwnExample('APPROVED_FOR_EVALUATION');
 form.set('status','REJECTED');
 assert.ok((await fetch(base+'/admin/rocky/aprendizaje',{method:'POST',headers:{cookie,origin:base},body:form})).ok);
 assert.equal((await db.rockyFeedback.findUnique({where:{id:feedback.id}})).status,'REJECTED');
 const unauth=await fetch(base+'/admin/rocky/aprendizaje',{redirect:'manual'});assert.ok([302,303,307,308,401].includes(unauth.status));
 console.log(JSON.stringify({ok:true,base,turns,bothBusinessFields:true,catalogFixed:true,noUnrelatedCable:true,feedbackReview:true,activateAndRevokeExample:true,unauthenticatedPage:unauth.status}));
} finally {if(ownFeedbackId)await db.rockyFeedback.updateMany({where:{id:ownFeedbackId},data:{status:'REJECTED',outcome:null}});await db.$disconnect()}
