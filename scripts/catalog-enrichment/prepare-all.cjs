/* eslint-disable @typescript-eslint/no-require-imports -- Standalone data preparation. */
const fs = require('node:fs');
const { catalogFacts } = require('./catalog-facts.cjs');
const { technicalState, digest } = require('./apply.cjs');
const officialDomains = ['jbl.com', 'mi.com', 'sony.com', 'sony.net', 'soundcore.com', 'logitechg.com', 'logi.com', 'hikvision.com', 'harmankardon.com', 'dji.com'];
const knownImages = p => [p.imageUrl, p.localImageUrl, p.sourceImageUrl, ...p.media.map(m => m.url)].filter(Boolean).map(u => new URL(u, 'https://tiendavirtualsuper.com').href);

function validateModels(research) {
  const seen = new Set();
  for (const m of research.models) {
    if (!m.id || !m.brand || !m.model || !m.codes.length || !m.sources.length || Object.keys(m.specs).length < 3) throw Error('Incomplete researched model');
    for (const source of m.sources) { const u = new URL(source); if (u.protocol !== 'https:' || !officialDomains.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) throw Error('Unreviewed manufacturer domain'); }
    for (const code of m.codes) { if (seen.has(code)) throw Error('Duplicate researched SKU'); seen.add(code); }
  }
}
function prepare(snapshot, research, imageResearch = { products: [] }) {
  validateModels(research);
  const models = new Map(research.models.flatMap(m => m.codes.map(c => [c, m])));
  const images = new Map(imageResearch.products.map(p => [p.code, p]));
  if (images.size !== imageResearch.products.length) throw Error('Duplicate image research SKU');
  const productCodes = new Set(snapshot.products.map(p => p.code));
  for (const code of [...models.keys(), ...images.keys()]) if (!productCodes.has(code)) throw Error(`Research SKU absent from snapshot: ${code}`);
  const preserved = []; const entries = [];
  for (const p of snapshot.products) {
    if (p.digitalProfile || p.specifications.length) { preserved.push({ productId: p.id, code: p.code, stateHash: digest(technicalState(p)) }); continue; }
    const base = catalogFacts(p); const model = models.get(p.code); const photo = images.get(p.code);
    if (model && photo) throw Error(`Choose one primary source for ${p.code}`);
    let specs; let sources; let sourceKind; let status; let evidence; let warnings = base.warnings;
    if (model) {
      specs = [{ name: 'Marca', value: model.brand }, { name: 'Modelo', value: model.model }, ...Object.entries(model.specs).map(([name, value]) => ({ name, value }))];
      sources = model.sources; sourceKind = 'MANUFACTURER'; status = 'PUBLICADA'; evidence = model; warnings = model.warnings || [];
    } else if (photo) {
      if (!photo.reviewed || !knownImages(p).includes(photo.source) || !Object.keys(photo.specs).length) throw Error(`Unreviewed or foreign photo: ${p.code}`);
      specs = [...base.facts.filter(f => !f.detail).map(({ name, value }) => ({ name, value })), ...Object.entries(photo.specs).map(([name, value]) => ({ name, value }))];
      sources = [photo.source]; sourceKind = 'STORE_IMAGE'; status = 'PUBLICADA'; evidence = photo; warnings = photo.warnings || [];
    } else {
      specs = base.facts.map(({ name, value }) => ({ name, value }));
      sources = [`https://tiendavirtualsuper.com/producto/${p.slug}`]; sourceKind = 'CATALOG_NAME'; status = base.status;
      evidence = base.facts; if (p.technicalSpecs) warnings.push('Texto técnico anterior conservado en Product; no se publica como evidencia sin contrastarlo.');
    }
    if (!specs.length) specs = [{ name: 'Código de producto', value: p.code }];
    const names = new Set();
    for (const s of specs) {
      if (!s.name || !s.value || s.name.length > 120 || s.value.length > 255 || /garant[ií]a|precio|stock|oferta|descuento/i.test(s.name)) throw Error(`Invalid attribute: ${p.code}/${s.name}`);
      if (names.has(s.name.toLowerCase())) throw Error(`Duplicate attribute: ${p.code}/${s.name}`); names.add(s.name.toLowerCase());
    }
    const summary = sourceKind === 'CATALOG_NAME' ? 'Datos anunciados en el catálogo de la tienda. La ficha es parcial; las características no indicadas requieren confirmación.' : sourceKind === 'STORE_IMAGE' ? 'Características anunciadas en la imagen de este producto. Los valores comerciales no representan mediciones independientes.' : null;
    // Legacy claims are replaced only with manufacturer or reviewed image evidence.
    const technicalSpecs = !p.technicalSpecs || sourceKind !== 'CATALOG_NAME' ? specs.map(s => `- **${s.name}:** ${s.value}`).join('\n') : p.technicalSpecs;
    const content = { specs, status, summary, sources, sourceKind, evidence, warnings, technicalSpecs };
    entries.push({ productId: p.id, code: p.code, expectedName: p.name,
      before: technicalState(p), expectedImages: [p.imageUrl, p.localImageUrl, p.sourceImageUrl, p.media],
      requestId: `catalog-20260918-${digest(p.code).slice(0, 25)}`, contentHash: digest(content), ...content });
  }
  return { version: 2, capturedAt: snapshot.capturedAt, preparedAt: new Date().toISOString(), preserved, entries };
}
function summary(plan) { return { total: plan.entries.length + plan.preserved.length, preserved: plan.preserved.length, update: plan.entries.length,
  published: plan.entries.filter(e => e.status === 'PUBLICADA').length, drafts: plan.entries.filter(e => e.status === 'BORRADOR').length,
  manufacturer: plan.entries.filter(e => e.sourceKind === 'MANUFACTURER').length, images: plan.entries.filter(e => e.sourceKind === 'STORE_IMAGE').length,
  catalog: plan.entries.filter(e => e.sourceKind === 'CATALOG_NAME').length, attributes: plan.entries.reduce((n,e) => n + e.specs.length, 0) }; }
if (require.main === module) {
  const [snapshotFile, researchFile, imageFile, outputFile] = process.argv.slice(2);
  if (!outputFile) throw Error('Usage: prepare-all.cjs snapshot research reviewed-images private-output');
  const plan = prepare(JSON.parse(fs.readFileSync(snapshotFile, 'utf8')), JSON.parse(fs.readFileSync(researchFile, 'utf8')), JSON.parse(fs.readFileSync(imageFile, 'utf8')));
  fs.writeFileSync(outputFile, JSON.stringify(plan, null, 2), { mode: 0o600 }); console.log(JSON.stringify(summary(plan)));
}
module.exports = { prepare, summary, validateModels, knownImages };
