/* eslint-disable @typescript-eslint/no-require-imports -- Reversible offline database import. */
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {digest,technicalState,untouchedState}=require('./apply.cjs');
const {precondition}=require('./apply-all.cjs');
const {summary,fields}=require('./prepare-refine.cjs');
const {forbidden}=require('./refine-facts.cjs');
const include={digitalProfile:true,specifications:{orderBy:[{sortOrder:'asc'},{id:'asc'}]},media:true,variants:true,documents:true,videos:true};
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
function validatePlan(plan){
 if(plan.version!==3||!Array.isArray(plan.entries)||!plan.entries.length)throw Error('Invalid refinement plan');
 const codes=new Set(),ids=new Set(),requests=new Set();
 for(const e of plan.entries){
  if(!e.productId||!e.code||!e.requestId?.startsWith('refine-20260918-')||codes.has(e.code)||ids.has(e.productId)||requests.has(e.requestId))throw Error('Invalid/duplicate identity');
  codes.add(e.code);ids.add(e.productId);requests.add(e.requestId);
  if(!['PUBLICADA','BORRADOR'].includes(e.status)||!['MANUFACTURER','STORE_IMAGE','CATALOG_NAME','EXISTING_MANUAL'].includes(e.sourceKind))throw Error('Invalid status/evidence');
  if(!Array.isArray(e.specs)||!e.before||!Array.isArray(e.before.specifications)||!Array.isArray(e.expectedImages)||!Array.isArray(e.sources))throw Error('Incomplete plan');
  const names=new Set();
  for(const s of e.specs){const key=s.name?.toLowerCase();if(Object.keys(s).some(k=>!['name','value'].includes(k))||!s.name||!s.value||typeof s.value!=='string'||s.name.length>120||s.value.length>255||names.has(key)||/precio|stock|garant[ií]a/i.test(s.name)||forbidden.test(s.name+' '+s.value)||/[<>]/.test(s.name+s.value))throw Error('Invalid public specification: '+e.code);names.add(key);}
  if(forbidden.test([e.summary,e.descriptionFull,e.technicalSpecs].join(' ')))throw Error('Public filler: '+e.code);
  const rendered=e.specs.length?e.specs.map(s=>`**${s.name}:** ${s.value}`).join('\n'):null;
  if(rendered!==e.technicalSpecs||e.contentHash!==digest(fields(e)))throw Error('Content hash/render mismatch: '+e.code);
 }
}
function assertApplied(product,entry,run){
 if(!product||run.result?.contentHash!==entry.contentHash||run.result?.appliedTechnicalHash!==digest(technicalState(product)))throw Error('Previous import or later edit differs: '+entry.code);
}
async function restoreEntry(tx,e,run){
 const p=await tx.product.findUnique({where:{id:e.productId},include});
 if(!p)throw Error('Missing rollback product: '+e.code);
 if(!run){if(digest(technicalState(p))!==digest(e.before))throw Error('Untracked edit: '+e.code);return false;}
 if(run.result?.appliedTechnicalHash!==digest(technicalState(p)))throw Error('Refusing rollback of later edits: '+e.code);
 const protectedHash=digest(untouchedState(p));
 await tx.productSpecification.deleteMany({where:{productId:e.productId}});
 await tx.digitalProductProfile.deleteMany({where:{productId:e.productId}});
 if(e.before.specifications.length)await tx.productSpecification.createMany({data:e.before.specifications});
 if(e.before.digitalProfile)await tx.digitalProductProfile.create({data:e.before.digitalProfile});
 await tx.product.update({where:{id:e.productId},data:{technicalSpecs:e.before.technicalSpecs}});
 await tx.productResearchRun.delete({where:{id:run.id}});
 const after=await tx.product.findUnique({where:{id:e.productId},include});
 if(digest(technicalState(after))!==digest(e.before)||digest(untouchedState(after))!==protectedHash)throw Error('Rollback verification failed: '+e.code);
 return true;
}
async function run(args){
 const option=n=>args.find(a=>a.startsWith(n+'='))?.slice(n.length+1);
 const apply=args.includes('--apply'),rollback=args.includes('--rollback');
 if(apply&&rollback)throw Error('Choose one mode');
 const backupFile=option('--backup'),planFile=option('--plan');
 const req=createRequire(path.join(process.cwd(),'package.json'));
 req('@next/env').loadEnvConfig(process.cwd());
 const {PrismaClient,Prisma}=req('@prisma/client'),db=new PrismaClient();
 const lock=(tx,ids)=>tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids.sort())}) ORDER BY id FOR UPDATE`);
 try{
  if(rollback){
   if(!backupFile)throw Error('Rollback requires backup');
   const b=read(backupFile);if(b.version!==3||!b.entries?.length)throw Error('Invalid backup');
   let restored=0;
   for(let i=0;i<b.entries.length;i+=40)await db.$transaction(async tx=>{
    const group=b.entries.slice(i,i+40);await lock(tx,group.map(e=>e.productId));
    for(const e of group){const prior=await tx.productResearchRun.findUnique({where:{requestId:e.requestId}});if(await restoreEntry(tx,e,prior))restored++;}
   },{timeout:60000});
   console.log(JSON.stringify({restored}));return;
  }
  if(!planFile)throw Error('Reviewed plan required');
  const plan=read(planFile);validatePlan(plan);
  const products=await db.product.findMany({where:{id:{in:plan.entries.map(e=>e.productId)}},include});
  const byId=new Map(products.map(p=>[p.id,p]));
  const runs=await db.productResearchRun.findMany({where:{requestId:{in:plan.entries.map(e=>e.requestId)}}});
  const byRequest=new Map(runs.map(r=>[r.requestId,r]));
  const pending=plan.entries.filter(e=>{const prior=byRequest.get(e.requestId);if(prior){assertApplied(byId.get(e.productId),e,prior);return false;}precondition(byId.get(e.productId),e);return true;});
  const result={...summary(plan),mode:apply?'apply':'dry-run',pending:pending.length,alreadyApplied:runs.length};
  if(!apply||!pending.length){console.log(JSON.stringify(result));return;}
  if(!backupFile||!path.isAbsolute(backupFile))throw Error('Private absolute backup required');
  fs.writeFileSync(backupFile,JSON.stringify({version:3,createdAt:new Date().toISOString(),planHash:digest(plan),entries:pending.map(e=>({productId:e.productId,code:e.code,requestId:e.requestId,before:e.before}))}),{mode:0o600,flag:'wx'});
  let applied=0;
  for(let i=0;i<pending.length;i+=40){
   await db.$transaction(async tx=>{
    const group=pending.slice(i,i+40);await lock(tx,group.map(e=>e.productId));
    for(const e of group){
     const p=await tx.product.findUnique({where:{id:e.productId},include});precondition(p,e);
     const protectedHash=digest(untouchedState(p));
     await tx.productSpecification.deleteMany({where:{productId:e.productId}});
     if(e.specs.length)await tx.productSpecification.createMany({data:e.specs.map((s,sortOrder)=>({productId:e.productId,...s,sortOrder}))});
     const profile={status:e.status,descriptionShort:e.summary,descriptionFull:e.descriptionFull};
     await tx.digitalProductProfile.upsert({where:{productId:e.productId},create:{productId:e.productId,...profile},update:profile});
     await tx.product.update({where:{id:e.productId},data:{technicalSpecs:e.technicalSpecs}});
     const after=await tx.product.findUnique({where:{id:e.productId},include});
     if(digest(untouchedState(after))!==protectedHash)throw Error('Nontechnical mutation: '+e.code);
     await tx.productResearchRun.create({data:{productId:e.productId,requestId:e.requestId,status:'COMPLETED',provider:'codex',requestedByName:'Revisión técnica autorizada por el propietario',completedAt:new Date(),
      result:{method:'catalog-refine-20260918',contentHash:e.contentHash,appliedTechnicalHash:digest(technicalState(after)),sourceKind:e.sourceKind,evidence:e.evidence,warnings:e.warnings,publicationStatus:e.status,imagesAdded:0,imagesReplaced:0,nontechnicalChanges:0},
      sources:{create:e.sources.map(url=>({url,domain:new URL(url).hostname,title:e.code+': evidencia técnica',sourceType:e.sourceKind,isOfficial:e.sourceKind==='MANUFACTURER'}))}}});
    }
   },{timeout:60000});
   applied+=Math.min(40,pending.length-i);console.log(JSON.stringify({applied,total:pending.length}));
  }
  console.log(JSON.stringify({...result,applied,imagesAdded:0,imagesReplaced:0,nontechnicalChanges:0}));
 }finally{await db.$disconnect();}
}
module.exports={validatePlan,assertApplied,restoreEntry,include};
if(require.main===module)run(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
