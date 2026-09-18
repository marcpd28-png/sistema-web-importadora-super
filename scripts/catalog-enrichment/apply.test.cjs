/* eslint-disable @typescript-eslint/no-require-imports -- Tests for the standalone CommonJS importer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateResearch, buildPlan, verifyPrecondition, technicalState, untouchedState, digest } = require('./apply.cjs');
const batch = require('./research-2026-09-18.json');
const makeProduct = () => ({ id: 'p1', code: 'TEST', name: 'Parlante modelo exacto', isVisible: true, stockUnits: 4,
  unitPrice: '99', description: 'Descripción original', technicalSpecs: null, digitalProfile: null, specifications: [],
  imageUrl: '/uploads/products/existing.webp', localImageUrl: '/uploads/products/existing.webp', sourceImageUrl: null,
  media: [{ id: 'media1', url: '/uploads/products/extra.webp' }], variants: [], documents: [], videos: [], updatedAt: '2026-09-18T00:00:00.000Z' });
const makeResearch = () => ({ version: 1, models: [{ id: 'fixture', brand: 'Marca', model: 'Modelo', codes: ['TEST'],
  sources: ['https://www.jbl.com/CLIP-5.html'], specs: { 'Tipo de producto': 'Parlante', 'Potencia nominal': '7 W', 'Bluetooth': '5.3' } }] });

test('the reviewed batch has unique SKUs, bounded attributes and manufacturer/store evidence', () => assert.equal(validateResearch(batch), batch));
test('rejects an image mutation disguised in a research record', () => {
  const data = makeResearch(); data.models[0].imageUrl = '/new.webp';
  assert.throws(() => validateResearch(data), /Unexpected model field/);
});
test('rejects commercial changes and spoofed manufacturer domains', () => {
  const data = makeResearch(); data.models[0].specs.Precio = '9';
  assert.throws(() => validateResearch(data), /Commercial/);
  delete data.models[0].specs.Precio; data.models[0].sources = ['https://jbl.com.evil.example/model'];
  assert.throws(() => validateResearch(data), /outside/);
});
test('refuses duplicate SKU assignment across models', () => {
  const data = makeResearch(); data.models.push({ ...structuredClone(data.models[0]), id: 'other-model' });
  assert.throws(() => validateResearch(data), /duplicate SKU/);
});
test('does not replace an existing authored sheet or legacy specs', () => {
  for (const change of [{ technicalSpecs: 'Anterior' }, { digitalProfile: { status: 'BORRADOR' } }, { specifications: [{ id: 's1', name: 'Dato', value: 'Anterior' }] }]) {
    assert.throws(() => buildPlan({ products: [{ ...makeProduct(), ...change }] }, makeResearch()), /already has/);
  }
});
test('requires source photos to be present on that specific SKU', () => {
  const data = makeResearch(); data.models[0].sourceKind = 'STORE_IMAGE';
  data.models[0].sources = ['https://tiendavirtualsuper.com/uploads/products/another-product.webp'];
  assert.throws(() => buildPlan({ products: [makeProduct()] }, data), /not the existing/);
  data.models[0].sources = ['https://tiendavirtualsuper.com/uploads/products/existing.webp'];
  assert.equal(buildPlan({ products: [makeProduct()] }, data).length, 1);
});
test('allows live price/stock movement but blocks a renamed SKU or new technical work', () => {
  const product = makeProduct(); const [entry] = buildPlan({ products: [product] }, makeResearch());
  assert.doesNotThrow(() => verifyPrecondition({ ...product, unitPrice: '100', stockUnits: 3 }, entry));
  assert.throws(() => verifyPrecondition({ ...product, name: 'Distinto modelo' }, entry), /identity changed/);
  assert.throws(() => verifyPrecondition({ ...product, technicalSpecs: 'Edición reciente' }, entry), /Technical content changed/);
  assert.throws(() => verifyPrecondition({ ...product, stockUnits: 0 }, entry), /no longer available/);
});
test('blocks a source-photo swap between review and application', () => {
  const product = makeProduct(); const [entry] = buildPlan({ products: [product] }, makeResearch());
  assert.throws(() => verifyPrecondition({ ...product, imageUrl: '/uploads/products/new.webp' }, entry), /Source image changed/);
});
test('protected hash covers prices, descriptions and every media/variant relation', () => {
  const product = makeProduct(); const original = digest(untouchedState(product));
  for (const change of [{ description: 'Alterada' }, { stockUnits: 100 }, { unitPrice: '5' }, { media: [] }, { imageUrl: '/new.webp' }, { variants: [{ id: 'v1', imageUrl: '/new.webp' }] }]) {
    assert.notEqual(digest(untouchedState({ ...product, ...change })), original);
  }
  assert.equal(digest(untouchedState({ ...product, technicalSpecs: 'Nuevas', updatedAt: 'later', specifications: [{ id: 'new' }], digitalProfile: { status: 'PUBLICADA' } })), original);
});
test('technical hash notices edits made after import, protecting rollback', () => {
  const product = makeProduct(); product.specifications = [{ id: 's', name: 'Potencia', value: '7 W', sortOrder: 0 }];
  const before = digest(technicalState(product)); product.specifications[0].value = '8 W';
  assert.notEqual(digest(technicalState(product)), before);
});
test('projector evidence preserves native/supported resolution and source conflicts', () => {
  const hy400 = batch.models.find(model => model.id === 'super-hy400-pro');
  assert.match(hy400.specs['Resolución nativa anunciada'], /1280.*720/);
  assert.match(hy400.specs['Compatibilidad de video anunciada'], /no equivale/);
  assert.match(hy400.specs['Sistema operativo anunciado'], /pendiente/);
  assert.equal(hy400.sourceKind, 'STORE_IMAGE');
});
test('Xtreme power and headphone ANC autonomy retain their operating conditions', () => {
  const xtreme = batch.models.find(model => model.id === 'jbl-xtreme-4');
  assert.match(xtreme.specs['Potencia RMS con corriente externa'], /100 W/);
  assert.match(xtreme.specs['Potencia RMS con batería'], /70 W/);
  const buds = batch.models.find(model => model.id === 'jbl-wave-beam-2');
  assert.match(buds.specs['Autonomía de los audífonos'], /10 horas.*desactivado.*8 horas.*activado/);
});
