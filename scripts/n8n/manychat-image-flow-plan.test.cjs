/* eslint-disable @typescript-eslint/no-require-imports -- Offline contract tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildImageFlowRequests, isManychatAccepted } = require('./manychat-image-flow-plan.cjs');
const input = { type: 'image', manychatSubscriberId: '12345', mediaUrl: 'https://example.test/photo.jpg', content: 'Foto', requestId: 'stable-request' };

test('sets both fields for the same subscriber before requesting the user-provided flow', () => {
  const plan = buildImageFlowRequests(input);
  assert.equal(plan.requests[0].url, 'https://api.manychat.com/fb/subscriber/setCustomFields');
  assert.deepEqual(plan.requests[0].body, { subscriber_id: 12345, fields: [
    { field_id: 14982263, field_value: input.mediaUrl }, { field_id: 14982264, field_value: 'Foto' },
  ] });
  assert.deepEqual(plan.requests[1].body, { subscriber_id: 12345, flow_ns: 'content20260919025706_215753' });
  assert.equal(plan.requestId, 'stable-request');
});
test('rejects missing media, wrong message type, unverified subscriber and absent request ID', () => {
  for (const change of [{ mediaUrl: '' }, { mediaUrl: 'http://example.test/a.jpg' }, { type: 'text' },
    { manychatSubscriberId: 'SIMULATOR:123' }, { manychatSubscriberId: '9007199254740993' }, { requestId: '' }]) {
    assert.throws(() => buildImageFlowRequests({ ...input, ...change }));
  }
});
test('HTTP success alone is not ManyChat acceptance', () => {
  assert.equal(isManychatAccepted(200, { status: 'error' }), false);
  assert.equal(isManychatAccepted(500, { status: 'success' }), false);
  assert.equal(isManychatAccepted(200, null), false);
  assert.equal(isManychatAccepted(200, { status: 'success' }), true);
});
