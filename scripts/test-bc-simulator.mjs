import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const read = name => JSON.parse(readFileSync(new URL(`../docs/n8n/bc-simulator/${name}.json`,import.meta.url)));
const run = (code,json) => new Function('$input',code)({first:()=>({json})});
const nodeCode = name => read('router').nodes.find(n=>n.name===name).parameters.jsCode;
const runPayload = context => new Function('$', nodeCode('Build Router Payload'))(name => ({first:()=>({json: name === 'Prepare Media Context' ? context : name === 'Transcribe Audio' ? {transcription:{status:'READY',text:'quiero uno'}} : {analysis:{status:'READY'},visualHints:{code:'P1',confidence:0.95}}})}))[0].json;

test('audio preserves typed corrections in their original order and matching image reference',()=>{
 const image={messageId:'i',messageType:'IMAGE',mediaUrl:'data:image/png;base64,YWJj'};
 const audio={messageId:'a',messageType:'AUDIO',mediaUrl:'data:audio/ogg;base64,YWJj'};
 const result=runPayload({conversationId:'sim',content:'mejor dos',needsAudio:true,needsVision:true,audioMedia:audio,imageMedia:image,latestMedia:audio,media:[image,audio],batch:{fragments:[{messageId:'i',content:'este modelo'},{messageId:'a',content:''},{messageId:'t',content:'mejor dos'}]}});
 assert.equal(result.content,'este modelo\nquiero uno\nmejor dos');
 assert.equal(result.messageType,'IMAGE');
 assert.equal(result.mediaUrl,image.mediaUrl);
 assert.equal(result.visualHints.code,'P1');
 const legacy=runPayload({content:'envio a Lima',needsAudio:true,batch:{},audioMedia:audio,latestMedia:audio});
 assert.equal(legacy.content,'envio a Lima\nquiero uno');
});

test('payment evidence remains the receipt when a later voice message accompanies it',()=>{
 const receipt={messageType:'IMAGE',mediaUrl:'data:image/png;base64,YWJj'};
 const audio={messageType:'AUDIO',mediaUrl:'data:audio/ogg;base64,YWJj'};
 const result=runPayload({content:'',needsAudio:true,needsVision:false,paymentEvidenceStage:true,media:[receipt,audio],imageMedia:receipt,audioMedia:audio,latestMedia:audio});
 assert.equal(result.messageType,'IMAGE');
 assert.equal(result.mediaUrl,receipt.mediaUrl);
 assert.equal(result.visualHints,null);
});

test('media entry accepts captions and does not bypass image analysis for catalog requests',()=>{
 const code=read('incoming').nodes.find(n=>n.name==='Validar simulación').parameters.jsCode;
 const value={simulation:{dryRun:true,source:'admin-simulator'},messages:[{from:'SIMULATOR:test',id:'SIM-CUSTOMER-test',type:'image',image:{link:'data:image/png;base64,YWJj',caption:'catalogo de este'},timestamp:'1'}]};
 const result=run(code,{body:{entry:[{changes:[{value}]}]}})[0].json;
 assert.equal(result.type,'IMAGE');
 assert.equal(result.content,'catalogo de este');
 const expression=read('incoming').nodes.find(n=>n.name==='¿Solicita catálogo?').parameters.conditions.conditions[0].leftValue;
 assert.equal(new Function('$json','return '+expression.slice(3,-2))(result),false);
 assert.equal(new Function('$json','return '+expression.slice(3,-2))({content:'catalogo de este',hasMedia:true}),false);
 value.messages[0].image.link='https://example.com/image.jpg';
 assert.throws(()=>run(code,{body:{entry:[{changes:[{value}]}]}}));
});

test('multiple media cannot silently discard earlier attachments',()=>{
 const w=read('router');
 const condition=w.nodes.find(n=>n.name==='Supported Media Batch').parameters.conditions.conditions[0].leftValue;
 const allowed=new Function('$json','return '+condition.slice(3,-2));
 assert.equal(allowed({media:[{messageType:'AUDIO'},{messageType:'IMAGE'}]}),true);
 for(const media of [[{messageType:'AUDIO'},{messageType:'AUDIO'}],[{messageType:'IMAGE'},{messageType:'IMAGE'}],[{messageType:'VIDEO'}]]) assert.equal(allowed({media}),false);
 assert.equal(w.connections['Prepare Media Context'].main[0][0].node,'Supported Media Batch');
 assert.equal(w.connections['Supported Media Batch'].main[1][0].node,'Clarify Media Batch');
});
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
 const payload=new Function('$json','$','return '+batch.jsonBody.slice(3,-2));
 const outboundMessages=Array.from({length:4},(_,i)=>({type:'IMAGE',content:String(i),mediaUrl:'https://example.com/'+i+'.jpg'}));
 assert.deepEqual(payload({conversationId:'sim',requestId:'r',outboundMessages},()=>({first:()=>({json:{triggerMessageId:'m'}})})).messages,outboundMessages);
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
 assert.equal(result[0].json.requestId,'bc:m');
 assert.equal(result[0].json.triggerMessageId,'m');
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
