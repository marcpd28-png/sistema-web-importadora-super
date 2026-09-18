/* eslint-disable @typescript-eslint/no-require-imports -- Read-only audit CLI, run with --import tsx. */
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createCatalogIndex } = require('../../src/lib/catalog-selection.ts');
const { emptyAgenda, planRequests } = require('../../src/lib/bc-request-agenda.ts');
const { parseCommercialQuery } = require('../../src/lib/commercial-query.ts');
const { getBotProductImageUrls, isBotProductAvailable } = require('../../src/lib/bot-product-availability.ts');

const phrasings = [
  { id: 'short', make: scope => `Hola, busco ${scope}, por favor` },
  { id: 'case_accents', make: scope => scope.toUpperCase() },
  { id: 'conditional', make: scope => `Buen día, ¿sería posible que me compartieran ${scope} cuando puedan?` },
  { id: 'purpose', make: scope => `Estoy armando mi pedido y me gustaría revisar ${scope} antes de decidir.` },
  { id: 'polite', make: scope => `Necesitaría por favor ${scope} para evaluar opciones.` },
  { id: 'help', make: scope => `¿Me ayudarías a conseguir ${scope}? Es para mi negocio.` },
  { id: 'followup', make: scope => `Quedo atento a que me faciliten ${scope}, muchas gracias.` },
];

function sameSet(left, right) {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function auditPhrasings(index, scopes) {
  return scopes.flatMap(scope => {
    const baseline = new Set(index.select(scope).products.map(product => product.code));
    if (!baseline.size) return [];
    return phrasings.map(phrasing => {
      const query = phrasing.make(scope);
      const actual = new Set(index.select(query).products.map(product => product.code));
      return { scope, phrasing: phrasing.id, query, expectedCount: baseline.size, actualCount: actual.size,
        missingCount: [...baseline].filter(code => !actual.has(code)).length,
        additionalCount: [...actual].filter(code => !baseline.has(code)).length, pass: sameSet(baseline, actual) };
    });
  });
}

function auditGuards() {
  const products = [
    { code: 'C1', name: 'CARGADOR SUPER 65W NEGRO', brand: 'SUPER', category: 'CARGADORES', unitPrice: 60 },
    { code: 'C2', name: 'CARGADOR SUPER 65W BLANCO', brand: 'SUPER', category: 'CARGADORES', unitPrice: 150 },
    { code: 'A1', name: 'AUDIFONO JBL BLUETOOTH NEGRO', brand: 'JBL', category: 'AURICULARES', unitPrice: 90 },
    { code: 'A2', name: 'ADAPTADOR BLUETOOTH PARA AUDIFONOS JBL', brand: 'JBL', category: 'ACCESORIOS', unitPrice: 30 },
    { code: 'TV1', name: 'TELEVISOR SAMSUNG 55 PULGADAS', brand: 'SAMSUNG', category: 'TELEVISORES', unitPrice: 1000 },
    { code: 'TVB', name: 'TV BOX ANDROID', brand: 'SUPER', category: 'MULTIMEDIA', unitPrice: 100 },
    { code: 'W1', name: 'SMART WATCH SILVER', brand: 'SUPER', category: 'SMART WATCH', unitPrice: 120 },
    { code: 'R1', name: 'REDMI NOTE 14 256GB', brand: 'XIAOMI', category: 'CELULARES', unitPrice: 600 },
    { code: 'R2', name: 'REDMI NOTE 14 PRO 256GB', brand: 'XIAOMI', category: 'CELULARES', unitPrice: 800 },
    { code: 'BT454', name: 'MODELO UNO', brand: null, category: null },
    { code: 'BT454.', name: 'MODELO DOS', brand: null, category: null },
  ];
  const index = createCatalogIndex(products);
  const cases = [
    { id: 'device_not_accessory', query: 'catálogo audífonos JBL Bluetooth', expected: ['A1'] },
    { id: 'tv_not_tv_box', query: 'catálogo tv', expected: ['TV1'] },
    { id: 'no_cross_family_typo', query: 'catálogo shaver', expected: [] },
    { id: 'base_not_pro', query: 'catálogo Redmi note 14 256GB', expected: ['R1'] },
    { id: 'literal_code', query: 'código BT454', expected: ['BT454'] },
    { id: 'literal_dotted_code', query: 'código BT454.', expected: ['BT454.'] },
    { id: 'negated_color', query: 'catálogo cargadores SUPER sin blanco', expected: ['C1'] },
    { id: 'global_budget', query: 'catálogo cargadores y audífonos, todos hasta 100 soles', expected: ['C1', 'A1'] },
    { id: 'shared_color', query: 'catálogo cargadores y audífonos, todos negros', expected: ['C1', 'A1'] },
    { id: 'unknown_brand', query: 'catálogo cargadores marca INEXISTENTE', expected: [] },
  ];
  const retrieval = cases.map(item => {
    const actual = index.select(item.query).products.map(product => product.code);
    return { ...item, actual, pass: sameSet(new Set(actual), new Set(item.expected)) };
  });
  const quantity = parseCommercialQuery('catálogo cargadores hasta 100W');
  const grammar = [{ id: 'power_is_not_money', query: 'catálogo cargadores hasta 100W',
    actual: quantity.constraints, pass: quantity.constraints.maxPrice === null }];
  const agendaCases = [
    { id: 'price_and_stock', messages: ['precio y stock del JBL charge 6'], kinds: ['PRICE', 'STOCK'] },
    { id: 'product_and_payment', messages: ['el cargador SUPER de 65W cuánto sale y se puede pagar con Yape'], kinds: ['PRICE', 'PAYMENT'] },
    { id: 'product_and_shipping', messages: ['necesito cargadores SUPER y saber cuánto cuesta el envío'], kinds: ['SEARCH', 'SHIPPING'] },
    { id: 'split_catalog', messages: ['quiero catálogo', 'de cargadores', 'y de audífonos'], kinds: ['CATALOG'], catalogContains: ['cargadores', 'audífonos'] },
    { id: 'quantity_followup', messages: ['precio JBL charge 6', 'dos unidades'], kinds: ['PRICE'], lastQuantity: 2 },
  ];
  const agenda = agendaCases.map(item => {
    const plan = planRequests(emptyAgenda(), item.messages.map((content, i) => ({ id: `m${i}`, content })));
    const actualKinds = [...new Set(plan.agenda.requests.map(job => job.kind))];
    const catalogSubjects = plan.agenda.requests.filter(job => job.kind === 'CATALOG')
      .map(job => plan.agenda.topics.find(topic => topic.id === job.topicId)?.query || '');
    const lastQuantity = plan.agenda.requests.filter(job => job.kind === 'PRICE').at(-1)?.quantity;
    return { ...item, actualKinds, catalogSubjects, lastQuantity,
      pass: item.kinds.every(kind => actualKinds.includes(kind)) &&
        (!item.catalogContains || catalogSubjects.some(subject => item.catalogContains.every(word => subject.includes(word)))) &&
        (!item.lastQuantity || lastQuantity === item.lastQuantity) };
  });
  return [...retrieval, ...grammar, ...agenda];
}

async function main() {
  if (!process.argv.includes('--read-only-inventory')) throw new Error('Use --read-only-inventory to audit the configured database; no messages or inventory writes occur.');
  require('@next/env').loadEnvConfig(process.cwd());
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    const products = await db.product.findMany({ where: { isVisible: true }, select: {
      code: true, name: true, brand: true, category: true, isVisible: true, stockUnits: true, unitPrice: true,
      categoryRef: { select: { name: true } }, specifications: { select: { name: true, value: true } },
      digitalProfile: { select: { status: true } }, localImageUrl: true, sourceImageUrl: true, imageUrl: true,
      media: { select: { type: true, url: true } },
    } });
    let referenceBrands = [];
    try { referenceBrands = JSON.parse(fs.readFileSync('.cache/catalog-reference-brands.json', 'utf8')).brands; } catch { /* Read existing cache only. */ }
    const available = products.filter(isBotProductAvailable);
    const index = createCatalogIndex(available, referenceBrands);
    const scopes = [...index.categories.map(category => `catálogo categoría ${category}`), ...index.brands.map(brand => `catálogo marca ${brand}`)];
    const variations = auditPhrasings(index, scopes);
    const guards = auditGuards();
    const report = { auditedAt: new Date().toISOString(),
      source: { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        moduleHashes: Object.fromEntries(['catalog-selection', 'commercial-query', 'bc-request-agenda', 'bot-product-availability'].map(name =>
          [name, createHash('sha256').update(fs.readFileSync(require.resolve(`../../src/lib/${name}.ts`))).digest('hex')])) },
      methodology: 'Read-only inventory snapshot; phrasing invariance against the same selector short query is NOT independent relevance or real-customer accuracy. Synthetic guards use independent expected codes. No messages sent or PDFs generated.',
      inventory: { visible: products.length, inStock: products.filter(p => p.stockUnits > 0).length, availableWithPhotoReference: available.length,
        missingBrandColumn: products.filter(p => !p.brand).length,
        missingBothBrandColumnAndAttribute: products.filter(p => !p.brand && !p.specifications.some(s => /^marca$/i.test(s.name))).length,
        withoutSpecifications: products.filter(p => !p.specifications.length).length,
        publishedProfiles: products.filter(p => p.digitalProfile?.status === 'PUBLICADA').length,
        withoutPhotoReference: products.filter(p => !getBotProductImageUrls(p).length).length },
      phrasing: { tested: variations.length, identical: variations.filter(v => v.pass).length,
        groups: Object.fromEntries(phrasings.map(p => { const cases = variations.filter(v => v.phrasing === p.id); return [p.id, { tested: cases.length, identical: cases.filter(v => v.pass).length }]; })), results: variations },
      guards: { tested: guards.length, passed: guards.filter(g => g.pass).length, results: guards } };
    const at = process.argv.indexOf('--output');
    if (at !== -1) fs.writeFileSync(process.argv[at + 1], JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, phrasing: { ...report.phrasing, results: undefined }, guards: { ...report.guards, results: guards.filter(g => !g.pass) } }, null, 2));
    if (process.argv.includes('--enforce') && (variations.some(result => !result.pass) || guards.some(result => !result.pass))) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

module.exports = { auditPhrasings, auditGuards, sameSet };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
