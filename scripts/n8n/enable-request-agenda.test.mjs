import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { enableRequestAgenda } from './enable-request-agenda.mjs';

test('agenda precedes catalog branching and fallback restores the original complete batch', () => {
  const workflow = JSON.parse(readFileSync(new URL('../../docs/n8n/bc-simulator/incoming.json', import.meta.url)));
  const before = structuredClone(workflow);
  enableRequestAgenda(workflow);
  assert.deepEqual(workflow, before, 'patch is idempotent');
  assert.equal(workflow.connections['Preparar consulta agrupada'].main[0][0].node, 'Resolver consultas pendientes');
  assert.equal(workflow.connections['¿Consultas atendidas?'].main[0].length, 0);
  const restored = workflow.nodes.find(n => n.name === 'Restaurar consulta original');
  const input = { content: 'catálogo JBL\n¿Aceptan Yape?', triggerMessageId: 'm2', messageIds: ['m1', 'm2'] };
  const output = new Function('$', restored.parameters.jsCode)(() => ({ first: () => ({ json: input }) }));
  assert.deepEqual(output[0].json, input);
  const endpoint = workflow.nodes.find(n => n.name === 'Resolver consultas pendientes');
  assert.equal(endpoint.retryOnFail, true);
  assert.match(endpoint.parameters.url, /\/chat\/requests$/);
});
