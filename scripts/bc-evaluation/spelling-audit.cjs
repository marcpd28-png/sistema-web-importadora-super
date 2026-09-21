/* eslint-disable @typescript-eslint/no-require-imports -- Local audit CLI, run with --import tsx. */
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { createCatalogIndex } = require('../../src/lib/catalog-selection.ts');
const { emptyAgenda, planRequests } = require('../../src/lib/bc-request-agenda.ts');

const [snapshotPath, reportPath, baselinePath] = process.argv.slice(2);
if (!snapshotPath || !reportPath) throw new Error('Usage: spelling-audit.cjs SNAPSHOT REPORT [BASELINE_MODULE]');
const snapshotText = fs.readFileSync(snapshotPath, 'utf8').replace(/^\uFEFF/, '');
const snapshot = JSON.parse(snapshotText);
const index = createCatalogIndex(snapshot.products, snapshot.brands);
const baseline = baselinePath ? require(require('node:path').resolve(baselinePath)).createCatalogIndex(snapshot.products, snapshot.brands) : null;
const codes = (engine, query) => engine.select(query).products.map(p => p.code).sort();
const compare = (expected, actual) => ({
  missing: expected.filter(code => !actual.includes(code)),
  additional: actual.filter(code => !expected.includes(code)),
  pass: expected.length > 0 && JSON.stringify(expected) === JSON.stringify(actual),
});
const results = [];
const skipped = [];
for (const type of index.types.filter(type => /^[a-z]{6,}$/.test(type))) {
  const middle = Math.floor(type.length / 2);
  const variants = new Map([
    ['prefix4', type.slice(0, 4)], ['prefix5', type.slice(0, 5)],
    ['last_missing', type.slice(0, -1)],
    ['middle_missing', type.slice(0, middle) + type.slice(middle + 1)],
    ['transposed', type.slice(0, middle) + type[middle + 1] + type[middle] + type.slice(middle + 2)],
  ]);
  const brands = [...new Set(snapshot.products.filter(p => index.productType(p) === type).map(p => index.productBrand(p)))].filter(brand => brand !== 'Otras marcas');
  for (const brand of ['', ...brands]) {
    const scope = `${type} ${brand}`.trim();
    const expected = codes(index, scope);
    if (!expected.length) { skipped.push({ scope, reason: 'full_name_has_no_results' }); continue; }
    for (const [kind, word] of variants) {
      if (word === type) continue;
      const query = `${word} ${brand}`.trim();
      const actual = codes(index, query);
      const previous = baseline ? compare(expected, codes(baseline, query)) : null;
      results.push({ type, brand, kind, query, expected, actual, ...compare(expected, actual), baselinePass: previous?.pass ?? null });
    }
  }
}
const identity = snapshot.products.map(product => {
  const actual = codes(index, `codigo ${product.code}`);
  return { code: product.code, actual, pass: JSON.stringify(actual) === JSON.stringify([product.code]) };
});
const fragmented = results.filter(r => r.kind === 'prefix4' && r.brand && r.pass).map(item => {
  const messages = ['precio', item.query.slice(0, 4), item.brand, '2 unidades'].map((content, i) => ({id:`m${i}`,content}));
  const plan = planRequests(emptyAgenda(), messages, index);
  const price = plan.agenda.requests.find(job => job.kind === 'PRICE');
  const topic = plan.agenda.topics.find(topic => topic.id === price?.topicId);
  const actual = topic ? codes(index, topic.query) : [];
  return { query: item.query, actual, ...compare(item.expected, actual), quantity: price?.quantity,
    sources: price?.sourceMessageIds, grouped: plan.agenda.topics.length === 1 && price?.quantity === 2 && price?.sourceMessageIds.length === 4 };
});
const summarize = list => ({ tested: list.length, matched: list.filter(r => r.pass).length,
  empty: list.filter(r => !r.actual.length).length, withAdditional: list.filter(r => r.additional?.length).length,
  baselineMatched: baseline ? list.filter(r => r.baselinePass).length : null });
const report = {
  auditedAt: new Date().toISOString(), capturedAt: snapshot.capturedAt,
  snapshotSha256: createHash('sha256').update(snapshotText).digest('hex'),
  moduleSha256: createHash('sha256').update(fs.readFileSync(require.resolve('../../src/lib/catalog-selection.ts'))).digest('hex'),
  methodology: 'Read-only published inventory snapshot. Generated prefix/deletion/transposition queries compared with the full family query on the same inventory. This measures invariance, not independently labeled relevance or real WhatsApp behavior. Some truncated words are ambiguous or valid different words. Exact SKU checks use inventory codes as independent expected values.',
  inventory: { published: snapshot.products.length, inStock: snapshot.products.filter(p => p.stockUnits > 0).length, brands: index.brands.length, types: index.types.length },
  summary: summarize(results), byKind: Object.fromEntries([...new Set(results.map(r => r.kind))].map(kind => [kind, summarize(results.filter(r => r.kind === kind))])),
  sku: { tested: identity.length, passed: identity.filter(r => r.pass).length, failures: identity.filter(r => !r.pass) },
  fragmented: { tested: fragmented.length, passed: fragmented.filter(r => r.pass && r.grouped).length, failures: fragmented.filter(r => !r.pass || !r.grouped) },
  regressions: results.filter(r => r.baselinePass && !r.pass), skipped, results,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({...report, results: undefined, regressions: report.regressions.slice(0, 8), skipped: skipped.length}, null, 2));
