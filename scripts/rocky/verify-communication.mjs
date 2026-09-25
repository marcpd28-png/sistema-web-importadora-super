import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {SignJWT} from 'jose';

const base=process.env.ROCKY_TEST_BASE||'http://127.0.0.1:4017';
if(!process.argv.includes('--execute')||!['127.0.0.1','tiendavirtualsuper.com'].includes(new URL(base).hostname))throw Error('SIMULATOR_ONLY');
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');
const db=new PrismaClient({datasourceUrl:url.toString()});
try {
 const admin=await db.user.findFirst({where:{role:'ADMIN'},select:{id:true,email:true,name:true}});
 assert.ok(admin&&process.env.AUTH_SECRET);
 const token=await new SignJWT({userId:admin.id,email:admin.email,name:admin.name,role:'ADMIN'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
 const headers={'content-type':'application/json',cookie:`importadora_session=${token}`};
 let turns=0;
 async function ask(content,sessionKey=`communication-${randomUUID()}`){
  const response=await fetch(base+'/api/admin/conversations/simulate',{method:'POST',headers,body:JSON.stringify({engine:'ROCKY',sessionKey,name:'Prueba técnica de comunicación',content}),signal:AbortSignal.timeout(60000)});
  assert.equal(response.status,200);const data=await response.json();assert.ok(data.rocky);turns++;return data.rocky;
 }
 for(const text of ['Me puede mandar catálogo','Podrías brindarme tu catálogo','Me comparte su catálogo'])assert.equal((await ask(text)).catalog.scope,'FULL');
 for(const text of ['Precio de la caja de 100','Estos que precio por 100','Si tienen stock de esto ?','Quiero más detalles sobre eso']) {
  const result=await ask(text);assert.equal(result.products.length,0);assert.match(result.reply,/producto|código/i);
 }
 const wrongPhone=await ask('Samsung galaxy A17 5g Samsung galaxy A56 5g precio por favor');
 assert.ok(wrongPhone.products.every(p=>/celular|galaxy|smartphone/i.test(p.name)&&!/soporte|cable|funda/i.test(p.name)));
 const product=await db.product.findFirst({where:{isVisible:true,code:'N1052'},select:{code:true,unitPrice:true}});assert.ok(product);
 const session=`communication-${randomUUID()}`;
 const initial=await ask(`precio ${product.code}`,session);assert.ok(initial.products.some(p=>p.code===product.code));
 const follow=await ask('y precio porfavor',session);assert.ok(follow.products.some(p=>p.code===product.code));assert.match(follow.reply,new RegExp(Number(product.unitPrice).toFixed(2).replace('.','\\.')));
 const settings=await db.storeSettings.findUnique({where:{id:1},select:{storeAddress:true}});assert.ok(settings.storeAddress);
 const combined=await ask(`Precio ${product.code}, dirección y delivery a Piura`);
 assert.ok(combined.reply.includes(Number(product.unitPrice).toFixed(2)));assert.ok(combined.reply.includes(settings.storeAddress));assert.match(combined.reply,/Envío:/);assert.doesNotMatch(combined.reply,/Quieres comprarlo/);
 const catalog=await ask('No puedo abrir el catálogo');assert.equal(catalog.catalog.scope,'FULL');assert.match(catalog.reply,/error al abrirlo/);
 console.log(JSON.stringify({ok:true,base,turns,catalogCourtesy:true,ambiguousReferences:true,phoneType:true,priceContext:true,multipleQuestions:true,catalogAccessHelp:true}));
}finally{await db.$disconnect()}
