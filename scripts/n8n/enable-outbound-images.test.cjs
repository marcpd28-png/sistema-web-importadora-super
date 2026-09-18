/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { enableOutboundImages } = require('./enable-outbound-images.cjs');

test('image is admitted and uses the media route with original transport and acceptance checks', () => {
  const input = { nodes: [
    { name: 'Validate Request', parameters: { conditions: { conditions: [{ id: '9988aaa9-373a-48dc-be4e-48d4a1af0ead', leftValue: 'old' }] } } },
    { name: 'Route Catalog Document', parameters: { conditions: { conditions: [{}] } } },
    { name: 'Send PDF Document', credentials: { existing: 'preserved' }, parameters: { url: 'https://graph.example.test/messages', jsonBody: "={{ { type: 'document', document: { link: $('Normalize Outbound V3').first().json.mediaUrl } } }}" } },
  ], connections: { media: 'acceptance-and-failure-branches' } };
  const output = enableOutboundImages(input);
  const evaluate = (expression, message) => JSON.parse(JSON.stringify(vm.runInNewContext(expression.slice(3, -2), { $json: message, $: () => ({ first: () => ({ json: message }) }) })));
  for (const type of ['image', 'document', 'text']) {
    const message = { type, mediaUrl: 'https://example.test/photo.jpg', content: 'A photo', recipient: '51999888777' };
    assert.equal(evaluate(output.nodes[0].parameters.conditions.conditions[0].leftValue, message), true);
    assert.equal(evaluate(output.nodes[1].parameters.conditions.conditions[0].leftValue, message), type !== 'text');
    if (type !== 'text') {
      const payload = evaluate(output.nodes[2].parameters.jsonBody, message);
      assert.equal(payload.type, type); assert.equal(payload[type].link, message.mediaUrl);
      if (type === 'image') { assert.equal(payload.image.caption, message.content); assert.equal(payload.to, message.recipient); }
    }
  }
  assert.equal(evaluate(output.nodes[0].parameters.conditions.conditions[0].leftValue, { type: 'image' }), false);
  assert.deepEqual(output.connections, input.connections);
  assert.deepEqual(output.nodes[2].credentials, input.nodes[2].credentials);
  assert.equal(output.nodes[2].parameters.url, input.nodes[2].parameters.url);
});
