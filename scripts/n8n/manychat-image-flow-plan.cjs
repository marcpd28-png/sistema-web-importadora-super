/* eslint-disable @typescript-eslint/no-require-imports -- Offline integration draft. */
const assert = require('node:assert/strict');

const FLOW_NS = 'content20260919025706_215753';
const FIELD_URL = 14982263;
const FIELD_TEXT = 14982264;

// Builds the requests only. Does not publish, send, or change any workflow.
// Execute only after publication and with a per-contact queue that waits for
// a verified flow-consumption acknowledgement before replacing shared fields.
function buildImageFlowRequests(input) {
  assert.equal(String(input.type).toLowerCase(), 'image', 'Image required');
  const subscriber = String(input.manychatSubscriberId ?? '');
  assert(/^\d+$/.test(subscriber), 'Verified ManyChat subscriber required');
  const subscriberId = Number(subscriber);
  assert(Number.isSafeInteger(subscriberId) && subscriberId > 0, 'Invalid subscriber');
  const media = new URL(input.mediaUrl);
  assert.equal(media.protocol, 'https:', 'Public HTTPS media URL required');
  assert(!media.username && !media.password, 'Credentials in media URL are not allowed');
  assert(typeof input.requestId === 'string' && input.requestId.trim(), 'Stable request ID required');
  return {
    requestId: input.requestId,
    subscriberId,
    requests: [
      {
        method: 'POST', url: 'https://api.manychat.com/fb/subscriber/setCustomFields',
        body: { subscriber_id: subscriberId, fields: [
          { field_id: FIELD_URL, field_value: media.href },
          { field_id: FIELD_TEXT, field_value: String(input.content ?? '') },
        ] },
      },
      {
        method: 'POST', url: 'https://api.manychat.com/fb/sending/sendFlow',
        body: { subscriber_id: subscriberId, flow_ns: FLOW_NS },
      },
    ],
  };
}

function isManychatAccepted(httpStatus, body) {
  return httpStatus >= 200 && httpStatus < 300 && body?.status === 'success';
}

module.exports = { buildImageFlowRequests, isManychatAccepted, FLOW_NS, FIELD_URL, FIELD_TEXT };
