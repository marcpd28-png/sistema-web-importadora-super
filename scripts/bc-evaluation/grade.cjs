/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS CLI, no application build required. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unique = values => [...new Set(values)];

/** Product identity is read from customer-visible text and the evidence of delivered PDFs.
 * A saved candidate list alone is NOT a delivered recommendation. General catalog links
 * must never count as thousands of successful product recommendations.
 */
function displayedCodes(result, products) {
  const messages = result.messages || [];
  const codes = [];
  for (const line of messages.flatMap(message => String(message.content || '').split('\n'))) {
    const text = normalize(line);
    const explicit = products.filter(product => new RegExp('codigo\\s*:?\\s*' + escape(normalize(product.code)) + '(?:\\s*[—:,;]|$)').test(text));
    if (explicit.length) { codes.push(...explicit.map(product => product.code)); continue; }
    // Display names can contain a legacy SKU different from the canonical trailing SKU.
    const matches = products.flatMap(product => {
      const literal = '(' + normalize(product.code) + ')'; const position = text.lastIndexOf(literal);
      return position < 0 ? [] : [{ code: product.code, position }];
    }).sort((a, b) => b.position - a.position);
    if (matches.length) codes.push(matches[0].code);
  }
  const agenda = result.state?.requestAgenda?.state;
  const catalogs = (agenda?.requests || []).filter(job => job.kind === 'CATALOG');
  for (const message of messages.filter(message => message.messageType === 'DOCUMENT')) {
    const content = normalize(message.content);
    const matching = catalogs.filter(job => {
      const topic = agenda.topics.find(topic => topic.id === job.topicId);
      return topic && content.includes('catalogo de ' + normalize(topic.query) + ':');
    });
    for (const job of matching) for (const evidence of job.evidence || []) {
      if (!evidence.startsWith('Product:')) continue;
      const product = products.find(product => evidence === 'Product:' + product.id || evidence.startsWith('Product:' + product.id + ':'));
      if (product) codes.push(product.code);
    }
  }
  return unique(codes);
}

// Only prices explicitly attached to an identified SKU in text. PDFs and transport
// tariffs are outside this check. A mismatch may be inventory drift, not fabrication.
function auditTextPrices(result, products) {
  const checked = []; let current;
  for (const message of result?.messages || []) {
    current = undefined;
    for (const line of String(message.content || '').split('\n')) {
      const ids = displayedCodes({ messages: [{ content: line, messageType: 'TEXT' }] }, products);
      if (ids.length === 1) current = products.find(product => product.code === ids[0]);
      const text = normalize(line);
      const prices = [...text.matchAll(/s\s*\/\s*(\d+(?:\.\d{1,2})?)/g)].map(match => Number(match[1]));
      if (!current || !prices.length || !Number.isFinite(Number(current.unitPrice))) continue;
      const quantity = Number(text.match(/\b(\d+)\s*unidad(?:\(es\)|es)?/)?.[1] || 1);
      const expected = current.wholesalePrice && quantity >= current.wholesaleMinQty ? Number(current.wholesalePrice) : Number(current.unitPrice);
      checked.push({ code: current.code, quantity, quotedUnit: prices[0], expectedUnit: expected, unitMatches: Math.abs(prices[0] - expected) < .005,
        ...(text.includes('total:') && prices.length > 1 ? { quotedTotal: prices[1], expectedTotal: Number((expected * quantity).toFixed(2)), totalMatches: Math.abs(prices[1] - expected * quantity) < .005 } : {}) });
    }
  }
  return checked;
}

function gradeCase(item, result, labels, products) {
  const text = normalize((result?.messages || []).map(message => message.content).join('\n'));
  const shown = displayedCodes(result || {}, products);
  const actual = new Set(shown);
  const targetLabels = item.targets.map(key => labels[key]);
  const expected = new Set(targetLabels.flatMap(label => label.codes));
  const scope = !item.targets.some(key => ['general', 'business', 'unclear'].includes(key));
  const complete = scope && targetLabels.every(label => label.complete);
  const relevant = shown.filter(code => expected.has(code));
  const wrong = complete ? shown.filter(code => !expected.has(code)) : [];
  const targetCoverage = scope ? item.targets.map(key => ({ target: key, expected: labels[key].codes.length, matched: labels[key].codes.filter(code => actual.has(code)).length })) : [];
  const positiveGroups = targetCoverage.filter(group => group.expected > 0);
  const hasAllTargets = positiveGroups.length > 0 && positiveGroups.every(group => group.matched > 0);
  const missingProduct = /no (?:pude|encontre|tenemos|tengo|cuento)|sin (?:stock|coincidencias)|no.*(?:disponible|publicad)/.test(text);
  const asksIdentity = /(?:puedes|indica|indicame|comparte|envia|dime).{0,65}(?:codigo|modelo|producto)|(?:que|cual).{0,40}(?:producto|modelo).{0,30}(?:buscas|necesitas|interesa|deseas)|necesito.{0,40}(?:codigo|modelo|producto)/.test(text);
  const unknownHandled = !shown.length && (missingProduct || asksIdentity);
  const noMatchExpected = scope && complete && expected.size === 0;
  const identified = hasAllTargets && !wrong.length;
  const baseProductAnswer = identified || noMatchExpected && unknownHandled;
  const jobs = result?.state?.requestAgenda?.state?.requests || [];
  const hasRelevantJob = kind => jobs.some(job => job.kind === kind && (job.evidence || []).some(evidence => products.some(product => expected.has(product.code) && (evidence === 'Product:' + product.id || evidence.startsWith('Product:' + product.id + ':')))));
  const money = /s\s*\/\s*\d|soles/.test(text);
  const docs = (result?.messages || []).filter(message => message.messageType === 'DOCUMENT');
  const pdfValid = docs.length > 0 && result.pdfChecks?.length === docs.length && result.pdfChecks.every(check => check.ok);
  const shortage = /insuficientes|sin stock|no puedo confirmar esa cotizacion/.test(text);
  const checks = item.outcomes.map(outcome => {
    let status = 'FAIL'; let reason = '';
    if (result?.transport !== 'ANSWERED') return { outcome, status, reason: 'No completed simulator response' };
    switch (outcome) {
      case 'SEARCH': status = baseProductAnswer ? 'PASS' : 'FAIL'; break;
      case 'PRICE': status = baseProductAnswer && (noMatchExpected || money || shortage) ? 'PASS' : 'FAIL'; break;
      case 'STOCK': status = baseProductAnswer && (noMatchExpected || /disponib|unidades|stock/.test(text)) ? 'PASS' : 'FAIL'; break;
      case 'INFORMATION': status = baseProductAnswer && (noMatchExpected || hasRelevantJob('INFORMATION')) ? 'PASS' : 'FAIL'; break;
      case 'CATALOG':
        status = item.targets.includes('general') ? /https?:\/\//.test(text) || pdfValid ? 'PASS' : 'FAIL'
          : noMatchExpected ? unknownHandled ? 'PASS' : 'FAIL'
          : identified && pdfValid ? 'PASS' : 'FAIL';
        break;
      case 'SHIPPING': status = /modalidades de entrega|metodos de (?:envio|entrega)|no tengo una tarifa|no tengo una cotizacion|shalom:|envios.{0,60}(?:agencia|destino|provincia)/.test(text) ? 'PASS' : 'FAIL'; break;
      case 'STORE': status = /direccion:|horario:|nos encontramos|nuestra tienda.{0,50}(?:ubic|avenida|av\.)/.test(text) ? 'PASS' : 'FAIL'; break;
      case 'PAYMENT': status = /metodos de pago|formas de pago|puedes pagar|yape|plin|transferencia bancaria/.test(text) ? 'PASS' : 'FAIL'; break;
      case 'CLARIFY': status = !shown.length && asksIdentity ? 'PASS' : 'FAIL'; break;
      case 'BOX_PRICE': status = noMatchExpected && unknownHandled ? 'PASS' : identified && /cajon|por caja|precio.*caja|\(caja\)/.test(text) && (money || /no tengo|confirmar|necesito/.test(text)) ? 'PASS' : 'FAIL'; break;
      case 'WHOLESALE': status = baseProductAnswer && /mayorista|por mayor/.test(text) ? 'PASS' : 'FAIL'; break;
      case 'COLORS': status = noMatchExpected && unknownHandled ? 'PASS' : identified && /colores|color:|no tengo.{0,40}color/.test(text) ? 'PASS' : 'FAIL'; break;
      // These require factual/manual judgement; keyword occurrence must not award a pass.
      case 'DEMO': case 'ORIGINAL': case 'CATALOG_NO_PRICES': status = 'REVIEW'; reason = 'Manual semantic review required'; break;
      default: throw new Error('Unknown outcome: ' + outcome);
    }
    if (item.quantity && ['PRICE', 'BOX_PRICE'].includes(outcome) && identified && !noMatchExpected) {
      const quantityPresent = new RegExp('\\b' + item.quantity + '\\s*(?:unidad|solicitad)').test(text);
      if (!quantityPresent) { status = 'FAIL'; reason = 'Requested quantity is absent from the quotation/stock response'; }
    }
    return { outcome, status, ...(reason ? { reason } : {}) };
  });
  const exactAvailable = complete && expected.size === 1 && !noMatchExpected;
  const expectedProduct = exactAvailable ? products.find(product => expected.has(product.code)) : null;
  const stockInsufficient = expectedProduct && item.quantity && expectedProduct.stockUnits < item.quantity;
  const avoidableClarification = Boolean(exactAvailable && !stockInsufficient && asksIdentity);
  return {
    id: item.id, split: item.split, transport: result?.transport || 'NOT_RUN', checks,
    status: checks.some(check => check.status === 'FAIL') || wrong.length ? 'FAIL' : checks.some(check => check.status === 'REVIEW') ? 'REVIEW' : 'PASS',
    retrieval: { eligible: scope, precisionEligible: complete, expectedCount: expected.size, shownCount: shown.length, relevantCount: relevant.length, wrongCodes: wrong, shownCodes: shown, targetCoverage,
      catalogRecall: item.outcomes.includes('CATALOG') && complete && expected.size > 0 ? relevant.length / expected.size : null },
    avoidableClarification, latencyMs: result?.latencyMs ?? null, pdfChecks: result?.pdfChecks || [],
    lateOrExtraReplies: result?.lateOrExtraReplies || 0, textPriceChecks: auditTextPrices(result, products),
  };
}

function summarize(graded) {
  const checks = graded.flatMap(item => item.checks);
  const eligible = graded.filter(item => item.retrieval.precisionEligible);
  const returned = eligible.reduce((n, item) => n + item.retrieval.shownCount, 0);
  const relevant = eligible.reduce((n, item) => n + item.retrieval.relevantCount, 0);
  const positiveGroups = graded.flatMap(item => item.retrieval.targetCoverage).filter(group => group.expected > 0);
  const catalogRecalls = graded.map(item => item.retrieval.catalogRecall).filter(value => value !== null);
  const latencies = graded.map(item => item.latencyMs).filter(value => value !== null).sort((a, b) => a - b);
  const pdfs = graded.flatMap(item => item.pdfChecks);
  const prices = graded.flatMap(item => item.textPriceChecks || []);
  return {
    cases: graded.length, passed: graded.filter(item => item.status === 'PASS').length, failed: graded.filter(item => item.status === 'FAIL').length, review: graded.filter(item => item.status === 'REVIEW').length,
    outcomes: { total: checks.length, passed: checks.filter(check => check.status === 'PASS').length, failed: checks.filter(check => check.status === 'FAIL').length, review: checks.filter(check => check.status === 'REVIEW').length },
    transport: { answered: graded.filter(item => item.transport === 'ANSWERED').length, timeout: graded.filter(item => item.transport === 'TIMEOUT').length, errors: graded.filter(item => item.transport === 'ERROR').length, lateOrExtraReplyCases: graded.filter(item => item.lateOrExtraReplies > 0).length },
    retrieval: { judgedReturnedProducts: returned, relevantReturnedProducts: relevant, microPrecision: returned ? relevant / returned : null,
      casesWithWrongProducts: eligible.filter(item => item.retrieval.wrongCodes.length > 0).length,
      positiveTargetGroups: positiveGroups.length, positiveGroupsFound: positiveGroups.filter(group => group.matched > 0).length,
      targetHitRate: positiveGroups.length ? positiveGroups.filter(group => group.matched > 0).length / positiveGroups.length : null,
      completeCatalogCases: catalogRecalls.length, meanCatalogRecall: catalogRecalls.length ? catalogRecalls.reduce((a, b) => a + b, 0) / catalogRecalls.length : null,
      avoidableClarificationCases: graded.filter(item => item.avoidableClarification).length },
    pdfs: { checked: pdfs.length, valid: pdfs.filter(check => check.ok).length },
    textPrices: { checked: prices.length, mismatches: prices.filter(check => !check.unitMatches || check.totalMatches === false).length },
    latencyMs: { median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null, p95: latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * .95) - 1)] : null },
  };
}

if (require.main === module) {
  const [runPath, snapshotPath, outputPath] = process.argv.slice(2);
  if (!runPath || !snapshotPath || !outputPath) throw new Error('Usage: node grade.cjs RUN.json SNAPSHOT.json OUTPUT.json');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const corpus = read(path.join(__dirname, 'cases.json')); const references = read(path.join(__dirname, 'catalog-labels.json'));
  const run = read(runPath); const snapshot = read(snapshotPath);
  if (createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') !== references.snapshotSha256) throw new Error('Reference inventory snapshot does not match catalog-labels.json; review/freeze labels before grading a different inventory.');
  const results = new Map(run.results.map(result => [result.id, result]));
  const graded = corpus.cases.filter(item => results.has(item.id)).map(item => gradeCase(item, results.get(item.id), references.labels, snapshot.products));
  const report = { version: 1, runStartedAt: run.startedAt, runCompletedAt: run.completedAt, referenceSnapshotAt: references.snapshotAt,
    notes: 'Automatic diagnostic rubric, not a human-certified sales quality score. Product relevance uses curated inventory labels; incomplete labels are excluded from precision/recall. Intent outcomes may overlap; manually review semantic/factual edge cases. General links are not product recommendations.',
    summary: summarize(graded), development: summarize(graded.filter(item => item.split === 'development')), holdout: summarize(graded.filter(item => item.split === 'holdout')), cases: graded };
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report.summary, null, 2));
}
module.exports = { displayedCodes, gradeCase, summarize, auditTextPrices };
