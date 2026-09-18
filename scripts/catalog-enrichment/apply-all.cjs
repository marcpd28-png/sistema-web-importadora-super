/* eslint-disable @typescript-eslint/no-require-imports -- Standalone, reversible database import. */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { digest, technicalState, untouchedState } = require('./apply.cjs');
const { summary } = require('./prepare-all.cjs');
const include = { digitalProfile: true, specifications: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, media: true, variants: true, documents: true, videos: true };
function precondition(p, e) {
  if (!p || p.id !== e.productId || p.code !== e.code || p.name !== e.expectedName) throw Error(`Identity changed: ${e.code}`);
  if (digest(technicalState(p)) !== digest(e.before)) throw Error(`Technical edit since review: ${e.code}`);
  if (digest([p.imageUrl, p.localImageUrl, p.sourceImageUrl, p.media]) !== digest(e.expectedImages)) throw Error(`Image changed since review: ${e.code}`);
}
function validatePlan(plan) {
  if (plan.version !== 2 || !Array.isArray(plan.entries) || !plan.entries.length || !Array.isArray(plan.preserved)) throw Error('Invalid plan');
  const ids = new Set(); const codes = new Set();
  for (const e of plan.entries) {
    if (ids.has(e.productId) || codes.has(e.code)) throw Error('Duplicate product'); ids.add(e.productId); codes.add(e.code);
    if (e.before.digitalProfile || e.before.specifications.length) throw Error('Cannot overwrite an existing sheet');
    if (!['PUBLICADA', 'BORRADOR'].includes(e.status) || !['MANUFACTURER', 'STORE_IMAGE', 'CATALOG_NAME'].includes(e.sourceKind)) throw Error('Invalid publication status or evidence');
    if (!e.specs.length || e.specs.some(s => !s.name || !s.value || s.name.length > 120 || s.value.length > 255 || /precio|stock|garant[ií]a/i.test(s.name))) throw Error('Invalid specifications');
    if (e.contentHash !== digest({ specs: e.specs, status: e.status, summary: e.summary, sources: e.sources, sourceKind: e.sourceKind, evidence: e.evidence, warnings: e.warnings, technicalSpecs: e.technicalSpecs })) throw Error('Plan content hash mismatch');
  }
}
async function run(args) {
  const option = name => args.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
  const apply = args.includes('--apply'); const rollback = args.includes('--rollback');
  if (apply && rollback) throw Error('Choose one mode');
  const backupFile = option('--backup'); const planFile = option('--plan');
  const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
  appRequire('@next/env').loadEnvConfig(process.cwd());
  const { PrismaClient, Prisma } = appRequire('@prisma/client'); const db = new PrismaClient();
  const lock = (tx, ids) => tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids.sort())}) ORDER BY id FOR UPDATE`);
  try {
    if (rollback) {
      if (!backupFile) throw Error('Rollback needs --backup');
      const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      if (backup.version !== 2 || !backup.entries.length) throw Error('Invalid backup');
      let restored = 0;
      for (let i = 0; i < backup.entries.length; i += 40) {
        await db.$transaction(async tx => {
          const group = backup.entries.slice(i, i + 40); await lock(tx, group.map(e => e.productId));
          for (const e of group) {
            const p = await tx.product.findUnique({ where: { id: e.productId }, include });
            const previous = await tx.productResearchRun.findUnique({ where: { requestId: e.requestId } });
            if (!previous) { if (digest(technicalState(p)) !== digest(e.before)) throw Error(`Untracked edit: ${e.code}`); continue; }
            if (previous.result?.appliedTechnicalHash !== digest(technicalState(p))) throw Error(`Refusing rollback of later edits: ${e.code}`);
            const protectedHash = digest(untouchedState(p));
            await tx.productSpecification.deleteMany({ where: { productId: e.productId } });
            await tx.digitalProductProfile.delete({ where: { productId: e.productId } });
            await tx.product.update({ where: { id: e.productId }, data: { technicalSpecs: e.before.technicalSpecs } });
            await tx.productResearchRun.delete({ where: { id: previous.id } });
            const after = await tx.product.findUnique({ where: { id: e.productId }, include });
            if (digest(technicalState(after)) !== digest(e.before) || digest(untouchedState(after)) !== protectedHash) throw Error('Rollback verification failed');
            restored++;
          }
        }, { timeout: 60000 });
      }
      console.log(JSON.stringify({ restored })); return;
    }
    if (!planFile) throw Error('A reviewed --plan is required');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); validatePlan(plan);
    const live = await db.product.findMany({ where: { id: { in: plan.entries.map(e => e.productId) } }, include });
    const byId = new Map(live.map(p => [p.id, p]));
    const runs = await db.productResearchRun.findMany({ where: { requestId: { in: plan.entries.map(e => e.requestId) } } });
    const byRequest = new Map(runs.map(r => [r.requestId, r]));
    const pending = plan.entries.filter(e => {
      const prior = byRequest.get(e.requestId);
      if (!prior) { precondition(byId.get(e.productId), e); return true; }
      if (prior.result?.contentHash !== e.contentHash || prior.result?.appliedTechnicalHash !== digest(technicalState(byId.get(e.productId)))) throw Error(`Previous import or later edit differs: ${e.code}`);
      return false;
    });
    const result = { ...summary(plan), mode: apply ? 'apply' : 'dry-run', pending: pending.length, alreadyApplied: runs.length };
    if (!apply || !pending.length) { console.log(JSON.stringify(result)); return; }
    if (!backupFile || !path.isAbsolute(backupFile)) throw Error('Apply requires private absolute --backup');
    fs.writeFileSync(backupFile, JSON.stringify({ version: 2, createdAt: new Date().toISOString(), planHash: digest(plan), entries: pending.map(e => ({ productId: e.productId, code: e.code, requestId: e.requestId, before: e.before })) }), { mode: 0o600, flag: 'wx' });
    let applied = 0;
    for (let i = 0; i < pending.length; i += 40) {
      await db.$transaction(async tx => {
        const group = pending.slice(i, i + 40); await lock(tx, group.map(e => e.productId));
        for (const e of group) {
          const p = await tx.product.findUnique({ where: { id: e.productId }, include }); precondition(p, e);
          const protectedHash = digest(untouchedState(p));
          await tx.productSpecification.createMany({ data: e.specs.map((s, sortOrder) => ({ productId: e.productId, name: s.name, value: s.value, sortOrder })) });
          await tx.digitalProductProfile.create({ data: { productId: e.productId, status: e.status, descriptionShort: e.summary, descriptionFull: null } });
          await tx.product.update({ where: { id: e.productId }, data: { technicalSpecs: e.technicalSpecs } });
          const after = await tx.product.findUnique({ where: { id: e.productId }, include });
          if (digest(untouchedState(after)) !== protectedHash) throw Error(`Unexpected nontechnical mutation: ${e.code}`);
          await tx.productResearchRun.create({ data: { productId: e.productId, requestId: e.requestId, status: 'COMPLETED', provider: 'codex',
            requestedByName: 'Actualización integral autorizada por el propietario', completedAt: new Date(),
            result: { method: 'catalog-coverage-20260918', contentHash: e.contentHash, appliedTechnicalHash: digest(technicalState(after)),
              sourceKind: e.sourceKind, coverage: e.sourceKind === 'MANUFACTURER' ? 'RESEARCHED' : e.sourceKind === 'STORE_IMAGE' ? 'ANNOUNCED_IMAGE' : e.status === 'PUBLICADA' ? 'PARTIAL_CATALOG' : 'PENDING_RESEARCH',
              publicationStatus: e.status, evidence: e.evidence, warnings: e.warnings, imagesAdded: 0, imagesReplaced: 0, commercialDescriptionChanged: false },
            sources: { create: e.sources.map(url => ({ url, domain: new URL(url).hostname, title: `${e.code}: evidencia ${e.sourceKind}`, sourceType: e.sourceKind, isOfficial: e.sourceKind === 'MANUFACTURER' })) } } });
        }
      }, { timeout: 60000 });
      applied += Math.min(40, pending.length - i); console.log(JSON.stringify({ applied, totalPending: pending.length }));
    }
    console.log(JSON.stringify({ ...result, applied, imagesAdded: 0, imagesReplaced: 0, nontechnicalChanges: 0 }));
  } finally { await db.$disconnect(); }
}
module.exports = { precondition, validatePlan };
if (require.main === module) run(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
