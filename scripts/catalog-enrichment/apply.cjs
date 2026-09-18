/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS data import, also executed from private VPS backup directories. */
/* Data-only import. No provider calls, image writes, ERP updates, or messages. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const officialDomains = ['jbl.com', 'mi.com', 'sony.com', 'soundcore.com', 'logitechg.com', 'hikvision.com'];
const include = { digitalProfile: true, specifications: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, media: true, variants: true, documents: true, videos: true };

function validateResearch(data) {
  if (data.version !== 1 || !Array.isArray(data.models) || !data.models.length) throw Error('Invalid research manifest');
  const codes = new Set(); const ids = new Set();
  for (const model of data.models) {
    const allowed = ['id', 'brand', 'model', 'codes', 'sources', 'sourceKind', 'specs', 'warnings'];
    if (Object.keys(model).some(key => !allowed.includes(key))) throw Error('Unexpected model field; only specifications may be imported');
    if (!model.id || ids.has(model.id) || !model.model || !model.brand) throw Error('Invalid or duplicate model');
    ids.add(model.id);
    if (!Array.isArray(model.codes) || !model.codes.length || !Array.isArray(model.sources) || !model.sources.length) throw Error('Missing codes or sources');
    if (model.sourceKind && model.sourceKind !== 'STORE_IMAGE') throw Error('Unsupported source kind');
    for (const code of model.codes) {
      if (typeof code !== 'string' || !code || codes.has(code)) throw Error('Invalid or duplicate SKU');
      codes.add(code);
    }
    for (const source of model.sources) {
      const url = new URL(source);
      if (url.protocol !== 'https:') throw Error('Only HTTPS evidence is supported');
      if (model.sourceKind === 'STORE_IMAGE') {
        if (url.hostname !== 'tiendavirtualsuper.com' || !url.pathname.startsWith('/uploads/products/')) throw Error('Image evidence must already belong to the store');
      } else if (!officialDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) throw Error('Manufacturer source outside the reviewed domains');
    }
    const specs = Object.entries(model.specs || {});
    if (specs.length < 3 || specs.length > 35) throw Error('Expected 3–35 researched attributes');
    const names = new Set();
    for (const [name, value] of specs) {
      if (!name.trim() || name.length > 120 || typeof value !== 'string' || !value.trim() || value.length > 255) throw Error('Invalid attribute length');
      if (/garant[ií]a|precio|stock|oferta|descuento/i.test(name)) throw Error('Commercial conditions are outside this import');
      const normalized = name.trim().toLowerCase();
      if (names.has(normalized)) throw Error('Duplicate attribute');
      names.add(normalized);
    }
  }
  return data;
}

function technicalState(product) {
  return { technicalSpecs: product.technicalSpecs, digitalProfile: product.digitalProfile,
    specifications: [...product.specifications].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)) };
}

function untouchedState(product) {
  const rest = { ...product };
  for (const key of ['technicalSpecs', 'digitalProfile', 'specifications', 'updatedAt']) delete rest[key];
  // Stable relation ordering avoids treating a database row-order change as a media edit.
  for (const name of ['media', 'variants', 'documents', 'videos']) rest[name] = [...rest[name]].sort((a, b) => a.id.localeCompare(b.id));
  return rest;
}

function buildPlan(snapshot, research) {
  validateResearch(research);
  const products = new Map(snapshot.products.map(product => [product.code, product]));
  return research.models.flatMap(model => model.codes.map(code => {
    const product = products.get(code);
    if (!product || !product.isVisible || product.stockUnits < 1) throw Error(`SKU is missing or unavailable: ${code}`);
    // The first enrichment batch deliberately preserves all pre-existing authored sheets.
    if (product.specifications.length || product.technicalSpecs || product.digitalProfile) throw Error(`SKU already has technical content: ${code}`);
    if (model.sourceKind === 'STORE_IMAGE') {
      const known = [product.imageUrl, product.localImageUrl, product.sourceImageUrl, ...product.media.map(item => item.url)]
        .filter(Boolean).map(url => new URL(url, 'https://tiendavirtualsuper.com').href);
      if (!model.sources.every(source => known.includes(source))) throw Error(`Image is not the existing SKU image: ${code}`);
    }
    const specs = [{ name: 'Marca', value: model.brand }, { name: 'Modelo', value: model.model }, ...Object.entries(model.specs).map(([name, value]) => ({ name, value }))];
    return {
      productId: product.id, code, expectedName: product.name,
      expectedTechnicalState: technicalState(product),
      expectedImages: [product.imageUrl, product.localImageUrl, product.sourceImageUrl, product.media],
      requestId: `spec-20260918-${digest([model.id, code]).slice(0, 28)}`,
      model, specs, technicalSpecs: specs.map(spec => `- **${spec.name}:** ${spec.value}`).join('\n'),
    };
  }));
}

function verifyPrecondition(product, entry) {
  if (!product || product.id !== entry.productId || product.code !== entry.code || product.name !== entry.expectedName) throw Error(`Product identity changed: ${entry.code}`);
  if (!product.isVisible || product.stockUnits < 1) throw Error(`Product is no longer available: ${entry.code}`);
  if (digest(technicalState(product)) !== digest(entry.expectedTechnicalState)) throw Error(`Technical content changed since review: ${entry.code}`);
  if (digest([product.imageUrl, product.localImageUrl, product.sourceImageUrl, product.media]) !== digest(entry.expectedImages)) throw Error(`Source image changed since review: ${entry.code}`);
}

async function main(args) {
  const mode = args.includes('--apply') ? 'apply' : args.includes('--rollback') ? 'rollback' : 'dry-run';
  if (args.includes('--apply') && args.includes('--rollback')) throw Error('Choose one operation');
  const option = name => args.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
  const manifestPath = path.resolve(option('--manifest') || 'scripts/catalog-enrichment/research-2026-09-18.json');
  const snapshotPath = option('--snapshot');
  const backupPath = option('--backup');
  const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
  appRequire('@next/env').loadEnvConfig(process.cwd());
  const { PrismaClient, Prisma } = appRequire('@prisma/client'); const db = new PrismaClient();
  try {
    if (mode === 'rollback') {
      if (!backupPath) throw Error('Rollback requires --backup');
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      if (backup.version !== 1 || !Array.isArray(backup.entries) || !backup.entries.length) throw Error('Invalid backup');
      await db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(backup.entries.map(entry => entry.productId).sort())}) ORDER BY id FOR UPDATE`);
        for (const entry of backup.entries) {
          const product = await tx.product.findUnique({ where: { id: entry.productId }, include });
          const run = await tx.productResearchRun.findUnique({ where: { requestId: entry.requestId } });
          if (!run || !run.result?.appliedTechnicalHash || digest(technicalState(product)) !== run.result.appliedTechnicalHash) throw Error(`Cannot rollback later edits: ${entry.code}`);
          if (entry.before.specifications.length || entry.before.digitalProfile) throw Error('Unsupported backup restoration');
          await tx.productSpecification.deleteMany({ where: { productId: entry.productId } });
          await tx.digitalProductProfile.delete({ where: { productId: entry.productId } });
          await tx.product.update({ where: { id: entry.productId }, data: { technicalSpecs: entry.before.technicalSpecs } });
          await tx.productResearchRun.delete({ where: { id: run.id } });
        }
      }, { timeout: 60000 });
      console.log(JSON.stringify({ rolledBack: backup.entries.length }));
      return;
    }
    if (!snapshotPath) throw Error('A reviewed --snapshot is required');
    const research = validateResearch(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const plan = buildPlan(snapshot, research);
    const live = await db.product.findMany({ where: { id: { in: plan.map(entry => entry.productId) } }, include });
    const liveById = new Map(live.map(product => [product.id, product]));
    const runs = await db.productResearchRun.findMany({ where: { requestId: { in: plan.map(entry => entry.requestId) } } });
    const runsByRequest = new Map(runs.map(run => [run.requestId, run]));
    const pending = plan.filter(entry => {
      const prior = runsByRequest.get(entry.requestId);
      if (!prior) { verifyPrecondition(liveById.get(entry.productId), entry); return true; }
      if (prior.result?.researchHash !== digest(entry.model) || digest(technicalState(liveById.get(entry.productId))) !== prior.result.appliedTechnicalHash) throw Error(`Existing import differs: ${entry.code}`);
      return false;
    });
    const summary = { mode, planned: plan.length, pending: pending.length, alreadyApplied: runs.length, official: pending.filter(entry => !entry.model.sourceKind).length, storeImages: pending.filter(entry => entry.model.sourceKind === 'STORE_IMAGE').length, attributes: pending.reduce((n, entry) => n + entry.specs.length, 0), researchHash: digest(research) };
    if (mode !== 'apply' || !pending.length) { console.log(JSON.stringify(summary)); return; }
    if (!backupPath || !path.isAbsolute(backupPath)) throw Error('Apply requires an absolute private --backup path');
    const backup = { version: 1, createdAt: new Date().toISOString(), researchHash: digest(research), entries: pending.map(entry => ({ productId: entry.productId, code: entry.code, requestId: entry.requestId, before: technicalState(liveById.get(entry.productId)) })) };
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), { flag: 'wx', mode: 0o600 });
    await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(pending.map(entry => entry.productId).sort())}) ORDER BY id FOR UPDATE`);
      for (const entry of pending) {
        const product = await tx.product.findUnique({ where: { id: entry.productId }, include });
        verifyPrecondition(product, entry);
        const protectedHash = digest(untouchedState(product));
        await tx.productSpecification.createMany({ data: entry.specs.map((spec, sortOrder) => ({ productId: entry.productId, ...spec, sortOrder })) });
        await tx.digitalProductProfile.create({ data: { productId: entry.productId, status: 'PUBLICADA', descriptionShort: null, descriptionFull: null } });
        await tx.product.update({ where: { id: entry.productId }, data: { technicalSpecs: entry.technicalSpecs } });
        const after = await tx.product.findUnique({ where: { id: entry.productId }, include });
        if (digest(untouchedState(after)) !== protectedHash) throw Error(`Unexpected change outside specifications: ${entry.code}`);
        await tx.productResearchRun.create({ data: {
          productId: entry.productId, requestId: entry.requestId, status: 'COMPLETED', provider: 'codex',
          identifiedBrand: entry.model.brand, identifiedModel: entry.model.model,
          requestedByName: 'Investigación de catálogo autorizada por el propietario', completedAt: new Date(),
          result: { method: 'codex-reviewed-specifications', researchHash: digest(entry.model), appliedTechnicalHash: digest(technicalState(after)),
            sourceKind: entry.model.sourceKind || 'MANUFACTURER', reviewedName: entry.expectedName,
            warnings: entry.model.warnings || [], specifications: entry.specs,
            evidence: entry.specs.map(spec => ({ attribute: spec.name, sources: entry.model.sources })),
            imagesAdded: 0, imagesReplaced: 0, descriptionsChanged: false },
          sources: { create: entry.model.sources.map(url => ({ url, title: `${entry.model.brand} — ${entry.model.model}`, domain: new URL(url).hostname, sourceType: entry.model.sourceKind || 'WEB', isOfficial: !entry.model.sourceKind })) },
        } });
      }
    }, { timeout: 60000 });
    console.log(JSON.stringify({ ...summary, applied: pending.length, backupPath, imagesAdded: 0, imagesReplaced: 0, unrelatedProductChanges: 0 }));
  } finally { await db.$disconnect(); }
}

module.exports = { validateResearch, buildPlan, verifyPrecondition, technicalState, untouchedState, digest };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
