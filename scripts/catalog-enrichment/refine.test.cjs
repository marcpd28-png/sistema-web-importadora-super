/* eslint-disable @typescript-eslint/no-require-imports -- Data migration regression tests. */
const test=require('node:test'),assert=require('node:assert/strict');
const {cleanSpec,forbidden}=require('./refine-facts.cjs');
const {prepare,fields,validateResearch}=require('./prepare-refine.cjs');
const {validatePlan,assertApplied,restoreEntry}=require('./apply-refine.cjs');
const {precondition}=require('./apply-all.cjs');
const {digest,technicalState}=require('./apply.cjs');
const models=require('./research-refine-2026-09-18.json');
const photos=require('./image-manual-refine-2026-09-18.json');
const product=(code='PC403')=>({id:code,code,name:'(PC403) COOLER C200',slug:code,technicalSpecs:'Texto anterior',imageUrl:'/uploads/products/c200.webp',localImageUrl:'/uploads/products/c200.webp',sourceImageUrl:null,media:[],variants:[],documents:[],videos:[],stockUnits:7,unitPrice:'50',digitalProfile:{id:'profile',productId:code,status:'BORRADOR',descriptionShort:'Ficha parcial pendiente de confirmar',descriptionFull:null,createdAt:'2026-09-18T00:00:00.000Z',updatedAt:'2026-09-18T00:00:00.000Z'},specifications:[{id:'s1',productId:code,name:'Tipo de producto',value:'Cooler',sortOrder:0,createdAt:'2026-09-18T00:00:00.000Z',updatedAt:'2026-09-18T00:00:00.000Z'}]});
const image={code:'PC403',specs:{Ventiladores:'2 de 125 mm',Velocidad:'1000–1200 RPM'},notes:[]};
const scan={code:'PC403',source:'/uploads/products/c200.webp',lines:[{text:'2 ventiladores',confidence:90}]};
const make=p=>prepare({products:[p],capturedAt:'2026-09-18'},[],[image],[scan]);

test('cleans provenance and pending boilerplate while retaining the stated figure',()=>{
 assert.deepEqual(cleanSpec({name:'Potencia anunciada',value:'45 W indicados en el catálogo; rendimiento y condiciones de funcionamiento pendientes de verificar.'}),{name:'Potencia',value:'45 W'});
 assert.equal(cleanSpec({name:'Carga rápida',value:'Sí; tecnología y requisitos pendientes de confirmar.'}),null);
 assert.equal(cleanSpec({name:'Versión',value:'Pendiente de confirmar'}),null);
 assert.equal(forbidden.test('Interruptor independiente'),false);
});
test('retains ANC conditions and never changes PMPO into RMS',()=>{
 assert.equal(cleanSpec({name:'Autonomía',value:'Hasta 90 h sin ANC o 60 h con ANC, con volumen al 30 %'}).value,'Hasta 90 h sin ANC o 60 h con ANC, con volumen al 30 %');
 const s=cleanSpec({name:'Potencia anunciada',value:'1500 W; valor PMPO, no equivale a RMS'});
 assert.equal(s.value,'1500 W PMPO');assert.doesNotMatch(s.value,/RMS/);
 assert.equal(cleanSpec({name:'Memoria RAM anunciada',value:'12 GB; confirmar RAM física, ampliación virtual.'}),null);
});
test('all reviewed manifests contain valid public attributes and unique SKUs',()=>{
 validateResearch(models);const codes=new Set();
 for(const p of photos){assert.ok(!codes.has(p.code));codes.add(p.code);for(const [name,value]of Object.entries(p.specs)){assert.ok(name.length<=120&&value.length<=255);assert.equal(forbidden.test(name+' '+value),false);assert.doesNotMatch(name+value,/[<>]/);}}
});
test('replaces filler with reviewed facts and binds image evidence to the exact product',()=>{
 const p=product(),plan=make(p);validatePlan(plan);const e=plan.entries[0];
 assert.equal(e.summary,null);assert.equal(e.status,'PUBLICADA');assert.match(e.technicalSpecs,/125 mm/);assert.equal(e.before.digitalProfile.id,'profile');
 assert.throws(()=>prepare({products:[p]},[],[image],[{...scan,source:'/uploads/products/foreign.webp'}]),/identity/);
 assert.throws(()=>prepare({products:[p]},[],[image,{...image}],[scan]),/Duplicate/);
});
test('manufacturer replaces conflicting image and catalog facts',()=>{
 const p={...product('O846'),name:'TABLET MEGA 2 WIFI 12GB RAM 256GB ROM'};
 const m=models.find(m=>m.codes.includes('O846'));
 const e=prepare({products:[p]},[m],[],[]).entries[0];
 assert.match(e.technicalSpecs,/A733/);assert.match(e.technicalSpecs,/9000/);assert.doesNotMatch(e.technicalSpecs,/T616|7680|Android 13/);
 assert.equal(e.sourceKind,'MANUFACTURER');
});
test('rejects changes to technical content and images, allows current stock and prices',()=>{
 const p=product(),e=make(p).entries[0];precondition({...p,stockUnits:99,unitPrice:'55'},e);
 assert.throws(()=>precondition({...p,technicalSpecs:'Human edit'},e),/Technical edit/);
 assert.throws(()=>precondition({...p,imageUrl:'different'},e),/Image changed/);
 const plan=make(p);plan.entries[0].specs[0].value='Injected';assert.throws(()=>validatePlan(plan),/mismatch/);
});
test('plan validation rejects public warnings even if hash is recomputed',()=>{
 const plan=make(product());plan.entries[0].summary='Datos pendientes de confirmar';plan.entries[0].contentHash=digest(fields(plan.entries[0]));
 assert.throws(()=>validatePlan(plan),/filler/);
});
test('an attribute cannot redirect its database write to another product',()=>{
 const plan=make(product());plan.entries[0].specs[0].productId='foreign';plan.entries[0].contentHash=digest(fields(plan.entries[0]));
 assert.throws(()=>validatePlan(plan),/Invalid public specification/);
});
test('idempotency rejects later human edits',()=>{
 const p=product(),e=make(p).entries[0],run={result:{contentHash:e.contentHash,appliedTechnicalHash:digest(technicalState(p))}};
 assert.doesNotThrow(()=>assertApplied(p,e,run));assert.throws(()=>assertApplied({...p,technicalSpecs:'Human edit'},e,run),/later edit/);
});
test('rollback restores original IDs, timestamps and profile without changing current commercial values',async()=>{
 const original=product(),e=make(original).entries[0];let live={...structuredClone(original),stockUnits:27,unitPrice:'75',technicalSpecs:e.technicalSpecs,specifications:[{id:'new',name:'Ventiladores',value:'2',sortOrder:0}],digitalProfile:{...original.digitalProfile,status:'PUBLICADA',descriptionShort:null}};
 const run={id:'run',result:{appliedTechnicalHash:digest(technicalState(live))}};let removed=false;
 const tx={product:{findUnique:async()=>structuredClone(live),update:async({data})=>Object.assign(live,data)},productSpecification:{deleteMany:async()=>{live.specifications=[];},createMany:async({data})=>{live.specifications=structuredClone(data);}},digitalProductProfile:{deleteMany:async()=>{live.digitalProfile=null;},create:async({data})=>{live.digitalProfile=structuredClone(data);}},productResearchRun:{delete:async()=>{removed=true;}}};
 assert.equal(await restoreEntry(tx,e,run),true);assert.deepEqual(technicalState(live),e.before);assert.equal(live.stockUnits,27);assert.equal(live.unitPrice,'75');assert.equal(removed,true);
 live.technicalSpecs='Later human change';await assert.rejects(()=>restoreEntry(tx,e,run),/later edits/);
});
