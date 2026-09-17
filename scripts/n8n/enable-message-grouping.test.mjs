import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { enableMessageGrouping } from './enable-message-grouping.mjs';
const read = name => JSON.parse(readFileSync(new URL(`../../docs/n8n/bc-simulator/${name}.json`, import.meta.url), 'utf8'));

test('catalog and router only receive grouped input after the common wait', () => {
  const flow = read('incoming');
  const next = name => flow.connections[name].main.flat().map(e => e.node);
  assert.deepEqual(next('Preparar BC'), ['Esperar pausa del cliente']);
  assert.deepEqual(next('Esperar pausa del cliente'), ['Agrupar mensajes pendientes']);
  assert.deepEqual(next('Preparar consulta agrupada'), ['¿Solicita catálogo?']);
  assert.deepEqual(next('¿Continuar esperando?'), ['Esperar pausa del cliente']);
  assert.deepEqual(next('Guardar mensaje de prueba'), ['Confirmar recepción', 'Preparar BC']);
  const wait = flow.nodes.find(n => n.name === 'Esperar pausa del cliente');
  const seconds = new Function('$json', 'return ' + wait.parameters.amount.slice(3, -2));
  assert.equal(seconds({}), 12);
  assert.equal(seconds({ batch: { waitMs: 4500 } }), 4.5);
  assert.equal(wait.parameters.unit, 'seconds');
  const code = flow.nodes.find(n => n.name === 'Preparar consulta agrupada').parameters.jsCode;
  const run = batch => new Function('$input', '$', code)({ first: () => ({ json: { batch } }) }, () => ({ first: () => ({ json: { conversationId: 'sim' } }) }));
  const result = run({ status: 'READY', latestMessageId: 'm3', content: 'hola\nbusco catálogo\nde proyectores', messageIds: ['m1', 'm2', 'm3'] });
  assert.equal(result[0].json.content, 'hola\nbusco catálogo\nde proyectores');
  assert.equal(result[0].json.triggerMessageId, 'm3');
  assert.equal(result[0].json.requestId, 'bc:m3');
  assert.deepEqual(run({ status: 'SUPERSEDED' }), []);
});

test('router has no extra delay or lossy rebatching and all replies carry the trigger', () => {
  const router = read('router');
  assert(!router.nodes.some(n => n.type.endsWith('.wait')));
  for (const name of ['Batch Messages', 'Recheck Latest Message']) {
    const node = router.nodes.find(n => n.name === name);
    assert.match(node.parameters.url, /simulator-input-batch$/);
    assert(!node.parameters.jsonBody.includes('maxWindowMs'));
  }
  assert.match(router.nodes.find(n => n.name === 'Registrar respuesta simulada').parameters.jsonBody, /triggerMessageId/);
  assert.match(read('catalog').nodes.find(n => n.name === 'Registrar catálogo simulado').parameters.jsonBody, /triggerMessageId/);
});

test('workflow transform is repeatable and leaves credential references intact', () => {
  const before = Object.fromEntries(['incoming', 'router', 'catalog'].map(name => [name, read(name)]));
  assert.deepEqual(enableMessageGrouping(structuredClone(before)), before);
});
