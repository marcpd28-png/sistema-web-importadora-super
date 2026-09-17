import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const edge = node => ({ node, type: 'main', index: 0 });
const connect = (flow, from, ...targets) => { flow.connections[from] = { main: targets.map(names => names.map(edge)) }; };
const requireNode = (flow, name) => {
  const node = flow.nodes.find(n => n.name === name);
  if (!node) throw new Error(`Missing node: ${name}`);
  return node;
};
const upsert = (flow, node) => {
  const index = flow.nodes.findIndex(n => n.name === node.name);
  if (index < 0) flow.nodes.push(node);
  else flow.nodes[index] = node;
};
const condition = (id, name, expression, position) => ({
  id, name, position, type: 'n8n-nodes-base.if', typeVersion: 2.3,
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
    conditions: [{ id: `${id}-condition`, leftValue: expression, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
});
const request = (id, name, path, body, credentials, position) => ({
  id, name, position, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5, credentials: structuredClone(credentials),
  parameters: { method: 'POST', url: `https://tiendavirtualsuper.com/api/internal/chat/${path}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: body, options: { timeout: 30000 } },
});

/** Apply the same inactivity gate before both catalog and conversational routing. */
export function enableMessageGrouping({ incoming, router, catalog }) {
  const credentials = requireNode(incoming, 'Guardar mensaje de prueba').credentials;
  upsert(incoming, { id: 'wait-customer-silence', name: 'Esperar pausa del cliente', position: [880, 80],
    type: 'n8n-nodes-base.wait', typeVersion: 1.1,
    parameters: { resume: 'timeInterval', amount: '={{ Math.max(1, ($json.batch?.waitMs ?? 12000) / 1000) }}', unit: 'seconds' },
  });
  upsert(incoming, request('read-customer-fragments', 'Agrupar mensajes pendientes', 'simulator-input-batch',
    "={{ { conversationId: $('Preparar BC').first().json.conversationId, triggerMessageId: $('Preparar BC').first().json.triggerMessageId } }}", credentials, [1100, 80]));
  upsert(incoming, condition('customer-batch-ready', '¿Consulta lista?', "={{ ['READY', 'TOO_LARGE'].includes($json.batch?.status) }}", [1320, 80]));
  upsert(incoming, condition('customer-still-writing', '¿Continuar esperando?', "={{ $json.batch?.status === 'WAITING' }}", [1320, 300]));
  upsert(incoming, condition('customer-batch-limit', '¿Consulta demasiado extensa?', "={{ $json.batch?.status === 'TOO_LARGE' }}", [1540, 80]));
  upsert(incoming, request('reply-customer-batch-limit', 'Pedir consulta más breve', 'simulator-batch',
    "={{ { conversationId: $('Preparar BC').first().json.conversationId, triggerMessageId: $json.batch.triggerMessageId, requestId: 'bc:' + $json.batch.triggerMessageId, messages: [{ type: 'TEXT', content: 'Recibí varios mensajes y la consulta es muy extensa. ¿Puedes resumirme qué productos o información necesitas para ayudarte mejor?' }] } }}", credentials, [1760, -140]));
  upsert(incoming, { id: 'prepare-grouped-query', name: 'Preparar consulta agrupada', position: [1760, 100],
    type: 'n8n-nodes-base.code', typeVersion: 2,
    parameters: { jsCode: "const batch = $input.first().json.batch;\nif (batch?.status !== 'READY') return [];\nconst saved = $('Preparar BC').first().json;\nreturn [{ json: { ...saved, content: batch.content, triggerMessageId: batch.latestMessageId, requestId: 'bc:' + batch.latestMessageId, messageIds: batch.messageIds } }];" },
  });
  connect(incoming, 'Preparar BC', ['Esperar pausa del cliente']);
  connect(incoming, 'Esperar pausa del cliente', ['Agrupar mensajes pendientes']);
  connect(incoming, 'Agrupar mensajes pendientes', ['¿Consulta lista?']);
  connect(incoming, '¿Consulta lista?', ['¿Consulta demasiado extensa?'], ['¿Continuar esperando?']);
  connect(incoming, '¿Continuar esperando?', ['Esperar pausa del cliente'], []);
  connect(incoming, '¿Consulta demasiado extensa?', ['Pedir consulta más breve'], ['Preparar consulta agrupada']);
  connect(incoming, 'Preparar consulta agrupada', ['¿Solicita catálogo?']);
  requireNode(incoming, '¿Solicita catálogo?').position = [1980, 100];
  requireNode(incoming, 'Catálogo de prueba').position = [2200, 0];
  requireNode(incoming, 'Responder con BC').position = [2200, 200];

  // The common entry already waited. Re-read the complete batch without a second delay or 8-message cutoff.
  router.nodes = router.nodes.filter(n => n.name !== 'Wait for Message Fragments');
  delete router.connections['Wait for Message Fragments'];
  connect(router, 'Normalize Router Input', ['Batch Messages']);
  for (const [name, source] of [['Batch Messages', 'Normalize Router Input'], ['Recheck Latest Message', 'Build Router Payload']]) {
    const node = requireNode(router, name);
    node.parameters.url = 'https://tiendavirtualsuper.com/api/internal/chat/simulator-input-batch';
    node.parameters.jsonBody = `={{ { conversationId: $('${source}').first().json.conversationId, triggerMessageId: $('${source}').first().json.triggerMessageId } }}`;
  }
  const prepare = requireNode(router, 'Prepare Ordered Outbound');
  prepare.parameters.jsCode = prepare.parameters.jsCode.replace(
    'requestId: `router:${normalized.triggerMessageId}`,',
    'requestId: `bc:${normalized.triggerMessageId}`,\n  triggerMessageId: normalized.triggerMessageId,',
  );
  requireNode(router, 'Registrar respuesta simulada').parameters.jsonBody =
    '={{ { conversationId: $json.conversationId, requestId: $json.requestId, triggerMessageId: $json.triggerMessageId, messages: $json.messages } }}';
  requireNode(catalog, 'Registrar catálogo simulado').parameters.jsonBody =
    "={{ { conversationId: $json.conversationId, requestId: $json.requestId, triggerMessageId: $('Entrada persistida').first().json.triggerMessageId, messages: $json.outboundMessages || [{ content: $json.content, mediaUrl: $json.mediaUrl, type: String($json.type || 'document').toUpperCase() }] } }}";
  return { incoming, router, catalog };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = new URL('../../docs/n8n/bc-simulator/', import.meta.url);
  const names = ['incoming', 'router', 'catalog'];
  const workflows = Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(new URL(`${name}.json`, directory), 'utf8'))]));
  enableMessageGrouping(workflows);
  for (const name of names) writeFileSync(new URL(`${name}.json`, directory), JSON.stringify(workflows[name], null, 2) + '\n');
}
