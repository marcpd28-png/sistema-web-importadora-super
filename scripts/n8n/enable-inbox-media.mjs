import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const value = "$json.body.entry[0].changes[0].value";
const message = `${value}.messages[0]`;

export function enableInboxMedia(source) {
  const workflow = structuredClone(source);
  const edit = workflow.nodes.find((node) => node.name === "Edit Fields1");
  const incoming = workflow.nodes.find((node) => node.name === "HTTP Request");
  if (!edit?.parameters?.assignments?.assignments || !incoming) {
    throw new Error("Expected the WhatsApp incoming normalization and persistence nodes");
  }
  const assignments = edit.parameters.assignments.assignments;
  const fields = [
    { name: "type", type: "string", value: `={{ ({ text: 'TEXT', image: 'IMAGE', audio: 'AUDIO', sticker: 'STICKER', video: 'VIDEO', document: 'DOCUMENT', location: 'LOCATION', contacts: 'CONTACT', button: 'TEXT', interactive: 'TEXT' })[${message}.type] || 'UNKNOWN' }}` },
    { name: "content", type: "string", value: `={{ ${message}.text?.body ?? ${message}.image?.caption ?? ${message}.video?.caption ?? ${message}.document?.caption ?? ${message}.button?.text ?? ${message}.interactive?.button_reply?.title ?? ${message}.interactive?.list_reply?.title ?? '' }}` },
    { name: "mediaId", type: "string", value: `={{ String(${message}[${message}.type]?.id ?? '') }}` },
    { name: "metadata", type: "object", value: `={{ { message: ${message}, phoneNumberId: ${value}.metadata?.phone_number_id ?? null } }}` },
  ];
  for (const field of fields) {
    const existing = assignments.find((item) => item.name.replace(/^=/, "") === field.name);
    if (existing) Object.assign(existing, field);
    else assignments.push({ id: `inbox-media-${field.name}`, ...field });
  }
  incoming.parameters.specifyBody = "json";
  incoming.parameters.jsonBody = "={{ { ...$('Edit Fields1').first().json, manychatSubscriberId: String($('Edit Fields1').first().json.externalContactId || '').startsWith('SIMULATOR:') ? '' : String($('Find ManyChat subscriber').first().json.data?.[0]?.id ?? '') } }}";
  delete incoming.parameters.bodyParameters;
  return workflow;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error("Usage: node enable-inbox-media.mjs workflow.json patched.json");
  writeFileSync(destination, JSON.stringify(enableInboxMedia(JSON.parse(readFileSync(source, "utf8"))), null, 2));
}
