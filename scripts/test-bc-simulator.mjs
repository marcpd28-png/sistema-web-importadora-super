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
 assert.equal(result[0].json.content,'Hola');
 assert.equal(result[0].json.isSimulation,true);
});
