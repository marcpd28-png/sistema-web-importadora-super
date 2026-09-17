import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Patch only the simulator entry; preserve credential references and legacy fallback. */
export function enableRequestAgenda(workflow) {
  const find = name => { const node = workflow.nodes.find(n => n.name === name); if (!node) throw new Error(`Missing ${name}`); return node; };
  const credentials = structuredClone(find('Agrupar mensajes pendientes').credentials);
  const nodes = [
    { id: 'bc-request-agenda', name: 'Resolver consultas pendientes', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5, position: [1980, 100], credentials,
      parameters: { method: 'POST', url: 'https://tiendavirtualsuper.com/api/internal/chat/requests', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ { conversationId: $json.conversationId, triggerMessageId: $json.triggerMessageId } }}', options: { timeout: 180000 } }, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 },
    { id: 'bc-request-agenda-handled', name: '¿Consultas atendidas?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [2200, 100], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'agenda-handled-condition', leftValue: '={{ $json.handled === true }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
    { id: 'bc-request-agenda-fallback', name: 'Restaurar consulta original', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2420, 180], parameters: { jsCode: "return [{ json: $('Preparar consulta agrupada').first().json }];" } },
  ];
  for (const node of nodes) {
    const existing = workflow.nodes.findIndex(n => n.name === node.name);
    if (existing === -1) workflow.nodes.push(node); else workflow.nodes[existing] = node;
  }
  const edge = node => ({ node, type: 'main', index: 0 });
  workflow.connections['Preparar consulta agrupada'] = { main: [[edge('Resolver consultas pendientes')]] };
  workflow.connections['Resolver consultas pendientes'] = { main: [[edge('¿Consultas atendidas?')]] };
  workflow.connections['¿Consultas atendidas?'] = { main: [[], [edge('Restaurar consulta original')]] };
  workflow.connections['Restaurar consulta original'] = { main: [[edge('¿Solicita catálogo?')]] };
  return workflow;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL('../../docs/n8n/bc-simulator/incoming.json', import.meta.url);
  writeFileSync(file, JSON.stringify(enableRequestAgenda(JSON.parse(readFileSync(file, 'utf8'))), null, 2) + '\n');
}
