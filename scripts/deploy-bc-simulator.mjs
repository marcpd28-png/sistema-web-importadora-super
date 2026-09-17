import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const base=(process.env.N8N_BASE_URL || process.env.N8N_URL || '').replace(/\/$/,'');
const key=process.env.N8N_WRITE_API_KEY;
const deferActivation=process.env.N8N_ACTIVATE_VIA_CLI==='1';
const catalogOnly=process.argv.includes('--catalog-only');
if(!base || !key) throw new Error('N8N_BASE_URL and N8N_WRITE_API_KEY are required');
async function api(route,method='GET',body) {
 const res=await fetch(`${base}/api/v1${route}`,{method,headers:{'X-N8N-API-KEY':key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 if(!res.ok) throw new Error(`n8n ${method} ${route}: ${res.status} ${await res.text()}`);
 return res.json();
}
const before=await api('/workflows?limit=100');
if(before.nextCursor) throw new Error('Workflow pagination required before deployment');
const backup=path.join(execFileSync('git',['rev-parse','--absolute-git-dir'],{encoding:'utf8'}).trim(),'bc-n8n');
mkdirSync(backup,{recursive:true});
writeFileSync(path.join(backup,`before-deploy-${Date.now()}.json`),JSON.stringify(before,null,2));
const ids=JSON.parse(readFileSync(new URL('../docs/n8n/bc-simulator/deployment.json',import.meta.url))).ids;
for(const name of (catalogOnly ? ['catalog','incoming'] : ['router','catalog','incoming'])) {
 let raw=readFileSync(new URL(`../docs/n8n/bc-simulator/${name}.json`,import.meta.url),'utf8');
 raw=raw.replaceAll('__ROUTER_ID__',ids.router||'').replaceAll('__CATALOG_ID__',ids.catalog||'');
 const payload=JSON.parse(raw);
 const old=before.data.find(w=>w.name===payload.name);
 const saved=await api(old?`/workflows/${old.id}`:'/workflows',old?'PUT':'POST',payload);
 if(!deferActivation) await api(`/workflows/${saved.id}/activate`,'POST');
 ids[name]=saved.id;
 // Store the exact deployed graph, containing credential references only.
 writeFileSync(new URL(`../docs/n8n/bc-simulator/${name}.json`,import.meta.url),JSON.stringify(payload,null,2)+'\n');
 console.log(`${name}: ${saved.id} ${deferActivation?'pending CLI publication':'active'}`);
}
// Keep real inbound capture and webhook acknowledgements; disconnect only automatic BC/catalog execution.
for(const id of (catalogOnly ? [] : ['EZaAQCCbY3qWIWY1','386c7deddf33dbb8'])) {
 const live=await api(`/workflows/${id}`);
 const old=before.data.find(w=>w.id===id);
 if(live.updatedAt!==old.updatedAt) throw new Error(`Workflow ${id} changed concurrently; inspect before retrying`);
 const targets=new Set(live.nodes.filter(n=>n.type==='n8n-nodes-base.executeWorkflow').map(n=>n.name));
 for(const ports of Object.values(live.connections)) for(const outputs of Object.values(ports)) for(let i=0;i<outputs.length;i++) outputs[i]=outputs[i].filter(e=>!targets.has(e.node) && e.node!=='Preparar catálogo automático');
 const settings={executionOrder:live.settings?.executionOrder||'v1',saveDataErrorExecution:'all',saveDataSuccessExecution:'none',saveManualExecutions:true};
 await api(`/workflows/${id}`,'PUT',{name:live.name,nodes:live.nodes,connections:live.connections,settings});
 if(!deferActivation) await api(`/workflows/${id}/activate`,'POST');
 console.log(`${live.name}: inbound capture only ${deferActivation?'(pending CLI publication)':''}`);
}
writeFileSync(new URL('../docs/n8n/bc-simulator/deployment.json',import.meta.url),JSON.stringify({base,ids,mode:'simulator-only'},null,2)+'\n');
