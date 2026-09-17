import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const read = name => JSON.parse(readFileSync(new URL(`../docs/n8n/bc-simulator/${name}.json`,import.meta.url)));
const run = (code,json) => new Function('$input',code)({first:()=>({json})});
test('simulator workflows contain no external message delivery nodes and all graph references resolve',()=>{
 for(const file of ['incoming','router','catalog']) {
  const w=read(file),names=new Set(w.nodes.map(n=>n.name));
  for(const [name,ports] of Object.entries(w.connections)) {
   assert(names.has(name),name);
   for(const outputs of Object.values(ports)) for(const output of outputs) for(const e of output) assert(names.has(e.node),e.node);
  }
  for(const n of w.nodes.filter(n=>n.type.endsWith('.httpRequest'))) {
   const url=n.parameters.url;
   assert(!/chat-outbound|graph\.facebook|api\.manychat|messages\/send/.test(url),url);
  }
 }
});
test('entry rejects real WhatsApp contacts even if dryRun is supplied',()=>{
 const code=read('incoming').nodes.find(n=>n.name==='Validar simulación').parameters.jsCode;
 const body={entry:[{changes:[{value:{simulation:{dryRun:true,source:'admin-simulator'},messages:[{from:'51999999999',id:'SIM-CUSTOMER-test',text:{body:'Hola'},timestamp:'1'}]}}]}]};
 assert.throws(()=>run(code,{body}),/Solo se admiten/);
 body.entry[0].changes[0].value.messages[0].from='SIMULATOR:test';
 assert.equal(run(code,{body})[0].json.externalContactId,'SIMULATOR:test');
 body.entry[0].changes[0].value.simulation.dryRun=false;
 assert.throws(()=>run(code,{body}),/Solo se admiten/);
});
test('all explicit catalog requests use the PDF branch before purchase-mode questions',()=>{
 const condition=read('incoming').nodes.find(n=>n.name==='¿Solicita catálogo?').parameters.conditions.conditions[0].leftValue;
 const evaluate=new Function('$json','return '+condition.slice(3,-2));
 for(const content of ['hola me dan el catalogo de los productos jbl?','catálogo de audofnos jbl','me pasa el catálogo de sus audífonos','catálogo de parlantes','CATÁLOGOS SONY']) assert.equal(evaluate({content}),true,content);
 assert.equal(evaluate({content:'precio del JBL charge 6'}),false);
 for(const content of ['Información sobre las pantallas extensoras','extensores de pantalla','extensores de pantalla en PDF']) assert.equal(evaluate({content}),true,content);
 assert.equal(evaluate({content:'extensor HDMI'}),false);
 const catalog=read('catalog');
 assert.match(catalog.nodes.find(n=>n.name==='Generar catálogo PDF').parameters.url,/\/catalogs\/products$/);
 assert.match(catalog.nodes.find(n=>n.name==='Registrar catálogo simulado').parameters.jsonBody,/\$json.type/);
 const batch=catalog.nodes.find(n=>n.name==='Registrar catálogo simulado').parameters;
 assert.match(batch.url,/\/chat\/simulator-batch$/);
 const payload=new Function('$json','return '+batch.jsonBody.slice(3,-2));
 const outboundMessages=Array.from({length:4},(_,i)=>({type:'IMAGE',content:String(i),mediaUrl:'https://example.com/'+i+'.jpg'}));
 assert.deepEqual(payload({conversationId:'sim',requestId:'r',outboundMessages}).messages,outboundMessages);
});
test('router ignores real and duplicate incoming messages; simulator runs without a phone number',()=>{
 const w=read('router');
 const code=w.nodes.find(n=>n.name==='Normalize Router Input').parameters.jsCode;
 const input={conversationId:'test',messageId:'SIM-CUSTOMER-example',simulation:false};
 assert.deepEqual(run(code,input),[]);
 assert.deepEqual(run(code,{...input,simulation:true,duplicate:true}),[]);
 assert.equal(run(code,{...input,simulation:true})[0].json.isSimulation,true);
 const outbound=w.nodes.find(n=>n.name==='Prepare Ordered Outbound').parameters.jsCode;
 const values={'Route Message V2':{conversation:{id:'test'},draftText:'Hola',outboundMessages:[]},'Normalize Router Input':{isSimulation:true,triggerMessageId:'m'},'Optional AI Draft':{}};
 const result=new Function('$',outbound)(name=>({first:()=>({json:values[name]})}));
 assert.deepEqual(result[0].json.messages,[{type:'TEXT',content:'Hola',mediaUrl:null}]);
 assert.equal(result[0].json.requestId,'router:m');
 assert.equal(result[0].json.isSimulation,true);
});

test('product and catalog replies share the greeting batch endpoint, preserving media order',()=>{
 const w=read('router');
 const register=w.nodes.find(n=>n.name==='Registrar respuesta simulada').parameters;
 assert.match(register.url,/\/chat\/simulator-batch$/);
 const values={
  'Route Message V2':{conversation:{id:'sim'},draftText:'Estos son los celulares Xiaomi.',outboundMessages:[
   {type:'IMAGE',caption:'Redmi Note 14',imageUrl:'https://example.com/redmi.jpg'},
   {type:'TEXT',text:'Estos son los celulares Xiaomi.'},
   {type:'VIDEO',caption:'Detalle',videoUrl:'https://example.com/redmi.mp4'},
  ]},
  'Normalize Router Input':{isSimulation:true,triggerMessageId:'m'},'Optional AI Draft':{},
 };
 const code=w.nodes.find(n=>n.name==='Prepare Ordered Outbound').parameters.jsCode;
 const result=new Function('$',code)(name=>({first:()=>({json:values[name]})}));
 assert.equal(result.length,1);
 const payload=new Function('$json','return '+register.jsonBody.slice(3,-2))(result[0].json);
 assert.equal(payload.conversationId,'sim');
 assert.equal(payload.messages.length,3);
 assert.deepEqual(payload.messages.map(m=>m.type),['IMAGE','TEXT','VIDEO']);
 assert.equal(payload.messages[0].mediaUrl,'https://example.com/redmi.jpg');
 assert.equal(payload.messages[1].content,'Estos son los celulares Xiaomi.');
});
