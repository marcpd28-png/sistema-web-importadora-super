/* eslint-disable @typescript-eslint/no-require-imports -- Standalone evaluation CLI. */
// Score catalog discovery from persisted product evidence, never from a code echoed in a refusal.
const fs = require('node:fs');
const [runPath, corpusPath, outputPath] = process.argv.slice(2);
if (!runPath || !corpusPath) throw new Error('Usage: catalog-score.cjs run.json cases.json [report.json]');
const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const definitions = new Map(corpus.cases.map(item => [item.id, item]));
const results = run.results.map(result => {
  const definition = definitions.get(result.id);
  if (!definition) throw new Error(`Unknown case ${result.id}`);
  const agenda = result.state?.requestAgenda?.state;
  const evidencedTopics = new Set((agenda?.requests || []).filter(job => job.evidence?.some(value => value.startsWith('Product:'))).map(job => job.topicId));
  const codes = [...new Set((agenda?.topics || []).filter(topic => evidencedTopics.has(topic.id)).flatMap(topic => topic.shownCodes || []))];
  const matched = codes.filter(code => definition.expectedCodes.includes(code));
  const unavailable = !codes.length && (result.messages || []).some(message => /actualmente.*(?:sin stock|no tiene una foto|sin una foto)/i.test(message.content || ''));
  return { id: result.id, group: definition.sourceGroup, query: definition.messages.join(' | '), transport: result.transport,
    pass: result.transport === 'ANSWERED' && matched.length > 0, unavailable,
    returnedCodes: codes, expectedMatches: matched, additionalCodes: codes.filter(code => !definition.expectedCodes.includes(code)),
    latencyMs: result.latencyMs, lateOrExtraReplies: result.lateOrExtraReplies || 0,
    response: (result.messages || []).map(message => message.content).join('\n'), pdfChecks: result.pdfChecks || [] };
});
const groups = Object.fromEntries([...new Set(results.map(item => item.group))].map(group => {
  const items = results.filter(item => item.group === group);
  return [group, { total: items.length, relevant: items.filter(item => item.pass).length, unavailable: items.filter(item => item.unavailable).length,
    errors: items.filter(item => item.transport !== 'ANSWERED').length }];
}));
const report = { completedAt: run.completedAt, planned: corpus.cases.length, completed: results.length, cleanup: run.cleanup, groups,
  totalLateOrExtraReplies: results.reduce((sum, item) => sum + item.lateOrExtraReplies, 0),
  failures: results.filter(item => !item.pass), results };
if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, results: undefined, failures: report.failures.map(item => ({ ...item, response: item.response.slice(0, 250) })) }, null, 2));
