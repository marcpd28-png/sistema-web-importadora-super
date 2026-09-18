/* eslint-disable @typescript-eslint/no-require-imports -- Standalone audit tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditPhrasings, auditGuards, sameSet } = require('./prevention-audit.cjs');

test('invariance audit detects lost and additional products, independent of ordering', () => {
  const index = { select(query) {
    if (query.startsWith('Buen día')) return { products: [{ code: 'B' }] };
    if (query.startsWith('Estoy')) return { products: [{ code: 'A' }, { code: 'B' }, { code: 'C' }] };
    return { products: [{ code: 'B' }, { code: 'A' }] };
  } };
  const rows = auditPhrasings(index, ['catálogo categoría PRUEBA']);
  assert.equal(rows.length, 7);
  assert.equal(rows.filter(row => row.pass).length, 5);
  assert.equal(rows.find(row => row.phrasing === 'conditional').missingCount, 1);
  assert.equal(rows.find(row => row.phrasing === 'purpose').additionalCount, 1);
  assert.ok(sameSet(new Set(['A', 'B']), new Set(['B', 'A'])));
});

test('empty baseline does not masquerade as a successful inventory search', () => {
  assert.deepEqual(auditPhrasings({ select: () => ({ products: [] }) }, ['catálogo desconocido']), []);
});

test('all independent interpretation guards pass without AI', () => {
  assert.deepEqual(auditGuards().filter(result => !result.pass), []);
});
