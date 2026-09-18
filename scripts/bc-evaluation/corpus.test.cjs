/* eslint-disable @typescript-eslint/no-require-imports -- Tests the standalone CommonJS evaluation corpus. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const references = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog-labels.json'), 'utf8'));
test('all 150 cases have unique, local source groups and valid manually defined targets', () => {
  assert.equal(corpus.cases.length, 150);
  assert.equal(new Set(corpus.cases.map(item => item.id)).size, 150);
  assert.equal(new Set(corpus.cases.map(item => item.sourceGroup)).size, 150);
  for (const item of corpus.cases) {
    assert.match(item.id, /^BC\d{3}$/); assert.match(item.sourceGroup, /^R\d{3}$/);
    assert.equal(item.origin, 'real_anonymized_excerpt'); assert(item.outcomes.length > 0);
    for (const target of item.targets) assert(references.labels[target], item.id + ' missing target ' + target);
  }
});
test('replay is text-only, within simulator bounds, and has no phone/email/URL/document identifiers', () => {
  for (const item of corpus.cases) for (const message of item.messages) {
    assert(message.length > 0 && message.length <= 1200, item.id);
    assert.doesNotMatch(message, /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, item.id);
    assert.doesNotMatch(message, /(?<![a-z0-9])(?:\+?51[ -]?)?\d(?:[ -]?\d){7,14}(?![a-z0-9])/i, item.id);
    assert.doesNotMatch(message, /\b(?:dni|ruc|mi nombre es|me llamo)\b/i, item.id);
  }
});
test('development and reserved conversations do not overlap', () => {
  const development = new Set(corpus.cases.filter(item => item.split === 'development').map(item => item.sourceGroup));
  const holdout = corpus.cases.filter(item => item.split === 'holdout');
  assert.equal(holdout.length, 35);
  assert(holdout.every(item => !development.has(item.sourceGroup)));
});
test('reference snapshot and product identity lists are well formed', () => {
  assert.match(references.snapshotSha256, /^[a-f0-9]{64}$/);
  for (const label of Object.values(references.labels)) {
    assert.equal(new Set(label.codes).size, label.codes.length);
    assert.equal(typeof label.complete, 'boolean');
  }
});
