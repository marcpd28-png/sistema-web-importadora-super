/* eslint-disable @typescript-eslint/no-require-imports -- Tests the standalone CommonJS evaluator. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { displayedCodes, gradeCase, summarize, auditTextPrices } = require('./grade.cjs');
const products = [{ id: 'p1', code: 'A1', stockUnits: 9 }, { id: 'p2', code: 'A1-SQ', stockUnits: 2 }, { id: 'p3', code: 'B2', stockUnits: 5 }];
const labels = { one: { codes: ['A1'], complete: true }, none: { codes: [], complete: true }, second: { codes: ['B2'], complete: true }, uncertain: { codes: ['A1'], complete: false }, general: { codes: ['A1', 'A1-SQ', 'B2'], complete: true } };
const makeCase = (overrides = {}) => ({ id: 'x', split: 'holdout', targets: ['one'], outcomes: ['PRICE'], ...overrides });
const reply = (content, extra = {}) => ({ transport: 'ANSWERED', messages: [{ messageType: 'TEXT', content }], ...extra });
test('does not count saved but undisplayed candidates or a general site link as recommendations', () => {
  const result = reply('Catálogo completo: https://example.test/', { state: { requestAgenda: { state: { topics: [{ id: 't', query: 'general', shownCodes: ['A1'] }], requests: [{ kind: 'CATALOG', topicId: 't', evidence: ['Product:p1'] }] } } } });
  assert.deepEqual(displayedCodes(result, products), []);
});
test('literal code extraction distinguishes prefix collisions and punctuated SKUs', () => {
  assert.deepEqual(displayedCodes(reply('1. Producto — código A1-SQ — S/ 20.00'), products), ['A1-SQ']);
  assert.deepEqual(displayedCodes(reply('Producto (A1) S/ 20.00'), products), ['A1']);
  assert.deepEqual(displayedCodes(reply('(A1) Nombre antiguo — código A1-SQ — S/ 20.00'), products), ['A1-SQ']);
  assert.deepEqual(displayedCodes(reply('(A1) Nombre antiguo (A1-SQ)'), products), ['A1-SQ']);
});
test('an offer to provide information later does not fulfill an information question', () => {
  const result = reply('Producto (A1). Puedes consultar características.', { state: { requestAgenda: { state: { requests: [{ kind: 'INFORMATION', evidence: [] }] } } } });
  assert.equal(gradeCase(makeCase({ outcomes: ['INFORMATION'] }), result, labels, products).status, 'FAIL');
});
test('retrieval cannot pass by returning a wrong product at the right price', () => {
  const result = gradeCase(makeCase(), reply('Otro (B2) S/ 20.00'), labels, products);
  assert.equal(result.status, 'FAIL'); assert.deepEqual(result.retrieval.wrongCodes, ['B2']);
});
test('known item not found is a miss; truly absent exact model can be answered honestly', () => {
  const answer = reply('No encontré productos. ¿Puedes indicar el código o modelo exacto?');
  assert.equal(gradeCase(makeCase(), answer, labels, products).status, 'FAIL');
  assert.equal(gradeCase(makeCase({ targets: ['none'] }), answer, labels, products).status, 'PASS');
});
test('each requested product family needs a hit, even if all returned items are relevant', () => {
  const result = gradeCase(makeCase({ targets: ['one', 'second'], outcomes: ['SEARCH'] }), reply('Producto (A1)'), labels, products);
  assert.equal(result.status, 'FAIL'); assert.equal(result.retrieval.targetCoverage[1].matched, 0);
});
test('a PDF must actually be delivered and readable; evidence alone does not pass', () => {
  const state = { requestAgenda: { state: { topics: [{ id: 't', query: 'audífonos' }], requests: [{ kind: 'CATALOG', topicId: 't', evidence: ['Product:p1'] }] } } };
  const result = { transport: 'ANSWERED', state, messages: [{ messageType: 'DOCUMENT', content: 'Catálogo de audífonos: 1 productos' }], pdfChecks: [{ ok: false }] };
  assert.deepEqual(displayedCodes(result, products), ['A1']);
  assert.equal(gradeCase(makeCase({ outcomes: ['CATALOG'] }), result, labels, products).status, 'FAIL');
  result.pdfChecks = [{ ok: true }];
  assert.equal(gradeCase(makeCase({ outcomes: ['CATALOG'] }), result, labels, products).status, 'PASS');
});
test('unit price does not satisfy a quantity quotation or box-price question', () => {
  const answer = reply('Producto (A1) Disponible S/ 20.00 por unidad.');
  assert.equal(gradeCase(makeCase({ quantity: 6 }), answer, labels, products).status, 'FAIL');
  assert.equal(gradeCase(makeCase({ outcomes: ['BOX_PRICE'] }), answer, labels, products).status, 'FAIL');
});
test('incomplete labels and semantic assertions are kept out of certified precision/pass counts', () => {
  const result = gradeCase(makeCase({ targets: ['uncertain'], outcomes: ['ORIGINAL'] }), reply('Producto (A1) original'), labels, products);
  assert.equal(result.status, 'REVIEW'); assert.equal(result.retrieval.precisionEligible, false);
  const summary = summarize([result]); assert.equal(summary.review, 1); assert.equal(summary.retrieval.microPrecision, null);
});
test('timeout is distinct from an answered but incorrect request', () => {
  const result = gradeCase(makeCase(), { transport: 'TIMEOUT' }, labels, products);
  assert.equal(result.status, 'FAIL'); assert.equal(summarize([result]).transport.timeout, 1);
});
test('text prices are independently checked against unit/wholesale snapshot and totals', () => {
  const priced = [{ id: 'p1', code: 'A1', unitPrice: '30.00', wholesalePrice: '25.00', wholesaleMinQty: 3 }];
  const valid = auditTextPrices(reply('Producto (A1)\n3 unidad(es): S/ 25.00 cada una. Total: S/ 75.00 (Mayorista).'), priced);
  assert.equal(valid.length, 1); assert.equal(valid[0].unitMatches, true); assert.equal(valid[0].totalMatches, true);
  const wrong = auditTextPrices(reply('Producto (A1)\n3 unidad(es): S/ 20.00 cada una. Total: S/ 60.00'), priced);
  assert.equal(wrong[0].unitMatches, false); assert.equal(wrong[0].totalMatches, false);
  assert.deepEqual(auditTextPrices(reply('Envío: S/ 10.00'), priced), []);
});
