/* eslint-disable @typescript-eslint/no-require-imports -- Offline reviewed data preparation. */
const fs = require('node:fs');
const { digest, technicalState } = require('./apply.cjs');
const { catalogFacts } = require('./catalog-facts.cjs');
const { knownImages } = require('./prepare-all.cjs');
const { cleanSpec, forbidden } = require('./refine-facts.cjs');

// Editorial exclusions: conflicting models or figures are never turned into public caveats.
const foreignImages = new Set(['05737','BT26','BT57','L356','L801','L830','N2093','N2133-SQ','N2183','N2277','N491-SQ','N567','O50','P1025','P1040','P437']);
const omissions = {
 BT07:/autonom/i, BT09:/autonom/i, CA605:/potencia/i, CC11:/potencia/i, CP588:/capacidad/i,
 CR419:/potencia/i, L193:/capacidad/i, L824:/capacidad/i, L827:/capacidad|dimensi/i,
 N2000:/dimensi/i, N2002:/dimensi/i, N2003:/dimensi/i, N2023:/memoria|bater|aplicaci/i,
 N2148:/di[aá]metro/i, N2209:/potencia/i, N2238:/GPS/i, N2253:/aumento|LED/i,
 N745:/potencia/i, N88:/juegos/i, O1838:/procesador/i, O1832:/conector/i,
 O1835:/compatib/i, O1837:/compatib|bater/i, O02:/conector/i, O185:/sistema operativo/i,
 O606:/corriente/i, 'O606-2M':/corriente/i, P00335:/potencia|bater|autonom/i,
 'P00335-368':/potencia|bater|autonom/i, P1059:/potencia/i, PC413:/botones/i,
 PC53:/bluetooth/i, P961:/Alexa/i, P373:/Alexa/i,
};
const domains = ['jbl.com','jblpro.com','mi.com','sony.com','sony.net','soundcore.com','soundpeats.com','qcy.com','haylou.com','kztws.com','blackview.hk','ecoflow.com','dahuasecurity.com','zealot-audio.com'];
const identity = s => /^(?:Marca|Modelo|Tipo de producto|Código de producto)$/.test(s.name);
const fields = e => ({specs:e.specs,status:e.status,summary:e.summary,descriptionFull:e.descriptionFull,sources:e.sources,sourceKind:e.sourceKind,evidence:e.evidence,warnings:e.warnings,technicalSpecs:e.technicalSpecs});
function validateResearch(models) {
 const codes=new Set();
 for(const m of models) {
  if(!m.id || !m.brand || !m.model || !m.codes?.length || !m.sources?.length || Object.keys(m.specs||{}).length<3)throw Error('Incomplete research');
  for(const c of m.codes){if(codes.has(c))throw Error('Duplicate research SKU');codes.add(c);}
  for(const s of m.sources){const u=new URL(s);if(u.protocol!=='https:'||!domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('Unreviewed manufacturer domain: '+u.hostname);}
 }
}
function prepare(snapshot, models, images, ocr) {
 validateResearch(models);
 const research=new Map(models.flatMap(m=>m.codes.map(c=>[c,m]))), photos=new Map(images.map(p=>[p.code,p]));
 const scans=new Map(ocr.map(p=>[p.code,p]));
 const codes=new Set(snapshot.products.map(p=>p.code));
 if(photos.size!==images.length)throw Error('Duplicate image SKU');
 for(const c of [...research.keys(),...photos.keys()])if(!codes.has(c))throw Error('Unknown research SKU: '+c);
 const entries=[];
 for(const p of snapshot.products){
  const m=research.get(p.code), image=photos.get(p.code), previous=p.researchRuns?.[0];
  const wasOfficial=previous?.sources?.some(s=>s.isOfficial);
  const catalog=catalogFacts(p).facts.map(cleanSpec).filter(Boolean);
  let specs=p.specifications.map(cleanSpec).filter(Boolean);
  let sourceKind=wasOfficial?'MANUFACTURER':previous?.result?.sourceKind||'EXISTING_MANUAL';
  let sources=previous?.sources?.map(s=>s.url)||[];
  let evidence={previousRunId:previous?.id||null};
  let warnings=[];
  if(m){
   specs=[{name:'Marca',value:m.brand},{name:'Modelo',value:m.model},...Object.entries(m.specs).map(([name,value])=>({name,value}))];
   sourceKind='MANUFACTURER';sources=m.sources;evidence=m;warnings=m.notes||[];
  } else if(image && !wasOfficial){
   const scan=scans.get(p.code);
   const source=scan?.source&&new URL(scan.source,'https://tiendavirtualsuper.com').href;
   if(!source || !knownImages(p).includes(source)||scan.error||foreignImages.has(p.code))throw Error('Image identity/evidence invalid: '+p.code);
   specs=[...catalog.filter(identity),...Object.entries(image.specs).map(([name,value])=>({name,value}))];
   sources=[source];sourceKind='STORE_IMAGE';
   evidence={reviewed:true,code:p.code,expectedTitle:p.name,image:source,specs:image.specs};warnings=image.notes||[];
  } else if(foreignImages.has(p.code) && !wasOfficial){
   specs=catalog;sources=[`https://tiendavirtualsuper.com/producto/${p.slug}`];sourceKind='CATALOG_NAME';
   warnings.push('Imagen descartada por discrepancia de modelo.');
  }
  if(!m && !wasOfficial && omissions[p.code])specs=specs.filter(s=>!omissions[p.code].test(s.name+' '+s.value));
  const seen=new Set();specs=specs.filter(s=>{const key=s.name.toLocaleLowerCase('es');if(seen.has(key))return false;seen.add(key);return true;});
  for(const s of specs)if(!s.name||!s.value||s.name.length>120||s.value.length>255||forbidden.test(s.name+' '+s.value)||/[<>]/.test(s.name+s.value))throw Error('Invalid public attribute: '+p.code+'/'+s.name);
  const useful=specs.some(s=>!identity(s));
  const status=useful?'PUBLICADA':'BORRADOR';
  const manual=sourceKind==='EXISTING_MANUAL';
  const summary=manual&&!forbidden.test(p.digitalProfile?.descriptionShort||'')?p.digitalProfile?.descriptionShort||null:null;
  const descriptionFull=manual&&!forbidden.test(p.digitalProfile?.descriptionFull||'')?p.digitalProfile?.descriptionFull||null:null;
  const technicalSpecs=specs.length?specs.map(s=>`**${s.name}:** ${s.value}`).join('\n'):null;
  const content={specs,status,summary,descriptionFull,sources,sourceKind,evidence,warnings,technicalSpecs};
  entries.push({productId:p.id,code:p.code,expectedName:p.name,before:technicalState(p),expectedImages:[p.imageUrl,p.localImageUrl,p.sourceImageUrl,p.media],requestId:`refine-20260918-${digest(p.code).slice(0,25)}`,contentHash:digest(content),...content});
 }
 return {version:3,capturedAt:snapshot.capturedAt,preparedAt:new Date().toISOString(),entries};
}
function summary(plan){return {total:plan.entries.length,published:plan.entries.filter(e=>e.status==='PUBLICADA').length,drafts:plan.entries.filter(e=>e.status==='BORRADOR').length,manufacturer:plan.entries.filter(e=>e.sourceKind==='MANUFACTURER').length,images:plan.entries.filter(e=>e.sourceKind==='STORE_IMAGE').length,attributes:plan.entries.reduce((n,e)=>n+e.specs.length,0),newManufacturer:plan.entries.filter(e=>e.evidence.id).length,newImage:plan.entries.filter(e=>e.evidence.reviewed).length};}
if(require.main===module){const [snapshot,research,images,ocr,out]=process.argv.slice(2);if(!out)throw Error('Usage: snapshot research images ocr private-output');const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));const plan=prepare(read(snapshot),read(research),read(images),read(ocr));fs.writeFileSync(out,JSON.stringify(plan),{mode:0o600});console.log(JSON.stringify(summary(plan)));}
module.exports={prepare,summary,fields,validateResearch};
