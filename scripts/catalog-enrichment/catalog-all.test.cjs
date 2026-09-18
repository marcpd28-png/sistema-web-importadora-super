/* eslint-disable @typescript-eslint/no-require-imports -- Data-import tests. */
const test = require('node:test'); const assert = require('node:assert/strict');
const { catalogFacts } = require('./catalog-facts.cjs');
const { imageCandidates } = require('./catalog-image-candidates.cjs');
const { prepare, validateModels } = require('./prepare-all.cjs');
const { precondition, validatePlan } = require('./apply-all.cjs');
const research = require('./research-all-2026-09-18.json');
const images = require('./images-all-2026-09-18.json');
const product = (name = '(T1) CABLE USB-C A USB-C 60W 1 METRO', code = 'T1') => ({ id: code, code, name, slug: code,
  isVisible: true, stockUnits: 2, technicalSpecs: null, specifications: [], digitalProfile: null,
  imageUrl: '/uploads/products/existing.webp', localImageUrl: '/uploads/products/existing.webp', sourceImageUrl: null,
  media: [], variants: [], videos: [], documents: [] });
const fields = name => Object.fromEntries(catalogFacts(product(name)).facts.map(s => [s.name, s.value]));
const plan = p => prepare({ products: [p], capturedAt: '2026-09-18' }, { models: [] });

test('keeps charger, cable and screen identity when accessory nouns follow', () => {
  assert.equal(fields('CARGADOR CON CABLE C A C 75W')['Tipo de producto'], 'Cargador');
  assert.equal(fields('CABLE CON SOPORTE PLEGABLE 100W')['Tipo de producto'], 'Cable');
  assert.equal(fields('PANTALLA ECRAN PARA PROYECTOR 120"')['Tipo de producto'], 'Pantalla de proyección');
});
test('ambiguous amps never become mAh', () => {
  assert.equal(fields('POWER BANK KING KONG DE 60000 AMPERIOS')['Capacidad de batería anunciada'], undefined);
  assert.equal(fields('POWER BANK 50000MHA')['Capacidad de batería anunciada'], undefined);
  assert.match(fields('POWER BANK 10000mAh')['Capacidad de batería anunciada'], /10000 mAh/);
});
test('part numbers are not power or battery values', () => {
  const f = fields('BATERIA BOSSNEY BS-S250AH-12V');
  assert.equal(f['Potencia anunciada'], undefined); assert.equal(f['Capacidad de batería anunciada'], undefined);
});
test('does not infer native projector resolution, RMS or universal compatibility', () => {
  assert.equal(fields('PROYECTOR HY300 4K')['Resolución nativa'], undefined);
  assert.match(fields('PARLANTE 10000W PMPO')['Potencia anunciada'], /PMPO, no equivale a RMS/);
  assert.match(fields('PARLANTE 200W')['Potencia anunciada'], /no se confirma potencia RMS/);
  assert.equal(fields('CONTROL REMOTO UNIVERSAL TV NA1').Compatibilidad, undefined);
});
test('USB-C does not imply video, power delivery, USB speed or device compatibility', () => {
  assert.match(fields('CABLE TIPO C A C 60W')['Conexión anunciada'], /no implica salida de video/);
  assert.equal(fields('CABLE TIPO C').Compatibilidad, undefined);
});
test('storage capacities with X prefix work and RAM expansion is qualified', () => {
  assert.match(fields('MEMORIA UDP X32 GB')['Almacenamiento anunciado'], /32 GB/);
  assert.match(fields('TABLET 12GB RAM 256GB ROM')['Memoria RAM anunciada'], /ampliación virtual/);
});
test('own brand is not inferred from super charging or Kaperh', () => {
  assert.equal(fields('CARGADOR SAMSUNG SUPER CARGA 45W')['Marca indicada en el catálogo'], 'SAMSUNG');
  assert.equal(fields('PARLANTE KAPERH SUPER BASS')['Marca indicada en el catálogo'], 'KAPERH');
  assert.equal(fields('CABLE M. SUPER 100W')['Marca indicada en el catálogo'], 'SUPER / Importaciones Super');
});
test('serial and customs identifiers never enter generated catalog evidence', () => {
  const f = catalogFacts(product('BICIMOTO HEEMER TDT086Z SERIE: SECRET123 DUA: SECRET456'));
  assert.doesNotMatch(JSON.stringify(f), /SECRET/);
});
test('names with no technical detail remain drafts', () => {
  assert.equal(catalogFacts(product('PARLANTE KAPERH')).status, 'BORRADOR');
  assert.equal(catalogFacts(product('N07')).status, 'BORRADOR');
});
test('previously published or authored sheets are preserved', () => {
  const p = product(); p.digitalProfile = { status: 'PUBLICADA' };
  const result = plan(p); assert.equal(result.entries.length, 0); assert.equal(result.preserved.length, 1);
});
test('commercial names alone cannot validate legacy text', () => {
  const p = product(); p.technicalSpecs = 'Autonomía inventada 1000 horas';
  const e = plan(p).entries[0]; assert.equal(e.technicalSpecs, p.technicalSpecs);
  assert.doesNotMatch(JSON.stringify(e.specs), /1000 horas/); assert.ok(e.warnings.length);
});
test('image evidence is pinned to the exact product image and must be reviewed', () => {
  const p = product(); const photo = { code: p.code, reviewed: true, source: 'https://tiendavirtualsuper.com/uploads/products/wrong.webp', specs: { Bluetooth: '5.4' } };
  assert.throws(() => prepare({ products: [p] }, { models: [] }, { products: [photo] }), /foreign photo/);
  photo.source = 'https://tiendavirtualsuper.com/uploads/products/existing.webp'; photo.reviewed = false;
  assert.throws(() => prepare({ products: [p] }, { models: [] }, { products: [photo] }), /Unreviewed/);
});
test('rejects spoofed source domains and duplicate SKU assignments', () => {
  const r = structuredClone(research); r.models[0].sources = ['https://mi.com.evil.example/product'];
  assert.throws(() => validateModels(r), /domain/);
  const d = structuredClone(research); d.models.push(d.models[0]); assert.throws(() => validateModels(d), /Duplicate/);
});
test('preflight allows live prices/stock but refuses changed name, photo or specs', () => {
  const p = product(); const e = plan(p).entries[0];
  assert.doesNotThrow(() => precondition({ ...p, unitPrice: 999, stockUnits: 0 }, e));
  assert.throws(() => precondition({ ...p, name: 'OTHER' }, e), /Identity/);
  assert.throws(() => precondition({ ...p, imageUrl: '/new' }, e), /Image/);
  assert.throws(() => precondition({ ...p, technicalSpecs: 'new' }, e), /Technical/);
});
test('edited plan content is rejected before writing', () => {
  const p = plan(product()); validatePlan(p); p.entries[0].specs[0].value = 'Changed';
  assert.throws(() => validatePlan(p), /hash/);
  const textPlan = plan(product()); textPlan.entries[0].technicalSpecs = 'Unreviewed text';
  assert.throws(() => validatePlan(textPlan), /hash/);
});
test('OCR alone cannot publish and unrelated photos are ignored', () => {
  const o = { lines: [{ text: 'POTENCIA 200W', confidence: 96, minConfidence: 95 }] };
  assert.equal(imageCandidates(product('CONTROL REMOTO NA1'), o).length, 0);
});
test('reviewed cable contradiction is explicit and not resolved by a guess', () => {
  const p = images.products.find(p => p.code === 'CA605');
  assert.match(p.specs['Potencia de carga pendiente'], /240 W.*100 W.*Confirmar/);
});
test('tablet physical and virtual RAM are kept separate', () => {
  const p = images.products.find(p => p.code === 'O846');
  assert.match(p.specs['Memoria RAM anunciada'], /4 GB físicos.*8 GB virtuales/);
});
test('official watch replacement fixes old water and compatibility claims', () => {
  const m = research.models.find(m => m.id === 'redmi-watch-6-active');
  assert.equal(m.specs['Resistencia al agua'], 'IP68 según fabricante');
  assert.match(m.specs.Compatibilidad, /iOS 14/);
  const p = product('(O1027-BLACK) REDMI WATCH 6 ACTIVE', 'O1027-BLACK'); p.technicalSpecs = '5ATM iOS12';
  const entry = prepare({ products: [p] }, { models: [{ ...m, codes: [p.code] }] }).entries[0];
  assert.doesNotMatch(entry.technicalSpecs, /5ATM|iOS12/);
});
test('every reviewed image attribute fits storage limits and has its SKU source', () => {
  assert.equal(new Set(images.products.map(p => p.code)).size, images.products.length);
  for (const p of images.products) for (const [name,value] of Object.entries(p.specs)) { assert.ok(name.length <= 120); assert.ok(value.length <= 255); }
});
