/* eslint-disable @typescript-eslint/no-require-imports -- Workflow patch CLI; never stores credentials in Git. */
const fs = require('node:fs');
const assert = require('node:assert/strict');

function enableOutboundImages(workflow) {
  const updated = structuredClone(workflow);
  const node = name => { const found = updated.nodes.find(n => n.name === name); assert(found, 'Missing node: ' + name); return found; };
  const validation = node('Validate Request').parameters.conditions.conditions.find(c => c.id === '9988aaa9-373a-48dc-be4e-48d4a1af0ead');
  assert(validation, 'Missing message type validation');
  validation.leftValue = "={{ ['text', 'document', 'image'].includes(String($json.type || '').toLowerCase()) && (String($json.type || '').toLowerCase() === 'text' || Boolean($json.mediaUrl)) }}";
  node('Route Catalog Document').parameters.conditions.conditions[0].leftValue = "={{ ['document', 'image'].includes(String($('Normalize Outbound V3').first().json.type).toLowerCase()) }}";
  const send = node('Send PDF Document');
  const original = send.parameters.jsonBody;
  assert(typeof original === 'string' && original.startsWith('={{') && original.endsWith('}}'), 'Unexpected media payload');
  const documentExpression = original.slice(3, -2).trim();
  send.parameters.jsonBody = "={{ String($('Normalize Outbound V3').first().json.type).toLowerCase() === 'image' ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: $('Normalize Outbound V3').first().json.recipient, type: 'image', image: { link: $('Normalize Outbound V3').first().json.mediaUrl, caption: $('Normalize Outbound V3').first().json.content } } : (" + documentExpression + ") }}";
  // Keep the existing credentials, URL, idempotency claims and acceptance/error paths.
  return updated;
}

module.exports = { enableOutboundImages };
if (require.main === module) {
  const [source, destination] = process.argv.slice(2);
  assert(source && destination, 'Usage: source-private-export destination-private-export');
  const workflows = JSON.parse(fs.readFileSync(source, 'utf8'));
  assert(workflows.length === 1 && workflows[0].id === 'fMANAA76DedfoMkQ', 'Unexpected workflow');
  fs.writeFileSync(destination, JSON.stringify([enableOutboundImages(workflows[0])], null, 2), { mode: 0o600 });
}
