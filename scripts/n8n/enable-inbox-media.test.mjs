import assert from "node:assert/strict";
import test from "node:test";
import { enableInboxMedia } from "./enable-inbox-media.mjs";

function fixture() {
  return {
    nodes: [
      { name: "Edit Fields1", parameters: { assignments: { assignments: [
        { name: "externalContactId", value: "={{ $json.body.entry[0].changes[0].value.messages[0].from }}", type: "string" },
        { name: "content", value: "={{ $json.body.entry[0].changes[0].value.messages[0].text?.body || '' }}", type: "string" },
      ] } } },
      { name: "HTTP Request", parameters: { url: "https://example.com/api/internal/chat/incoming", bodyParameters: { parameters: [] } }, credentials: { httpHeaderAuth: { id: "existing-auth" } } },
    ],
    connections: { "HTTP Request": { main: [[{ node: "Respond to Webhook1", type: "main", index: 0 }]] } },
  };
}

function evaluate(expression, json, lookup) {
  return new Function("$json", "$", `return (${expression.slice(3, -2).trim()});`)(json, lookup);
}

function incomingPayload(type, attachment, from = "PE.123456789") {
  const workflow = enableInboxMedia(fixture());
  const rawMessage = { from, id: "wamid.media", timestamp: "1789646400", type, [type]: attachment };
  const raw = { body: { entry: [{ changes: [{ value: { messages: [rawMessage], metadata: { phone_number_id: "business-123" } } }] }] } };
  const normalized = Object.fromEntries(workflow.nodes[0].parameters.assignments.assignments.map(
    (field) => [field.name, evaluate(field.value, raw)],
  ));
  const lookup = (name) => ({ first() {
    if (name === "Edit Fields1") return { json: normalized };
    if (from.startsWith("SIMULATOR:")) throw new Error("Simulator must not access ManyChat");
    return { json: { data: [{ id: "subscriber-123" }] } };
  } });
  return JSON.parse(JSON.stringify(evaluate(workflow.nodes[1].parameters.jsonBody, {}, lookup)));
}

test("sticker and voice note retain file identity, MIME, sender and receiving business", () => {
  for (const [type, mime] of [["sticker", "image/webp"], ["audio", "audio/ogg; codecs=opus"]]) {
    const result = incomingPayload(type, { id: "987654", mime_type: mime, ...(type === "audio" ? { voice: true } : { animated: true }) });
    assert.equal(result.type, type.toUpperCase());
    assert.equal(result.content, "");
    assert.equal(result.mediaId, "987654");
    assert.equal(result.metadata.message[type].id, "987654");
    assert.equal(result.metadata.message[type].mime_type, mime);
    assert.equal(result.metadata.phoneNumberId, "business-123");
    assert.equal(result.externalContactId, "PE.123456789");
    assert.equal(result.manychatSubscriberId, "subscriber-123");
  }
});

test("text and captions are preserved while unsupported types remain valid", () => {
  assert.equal(incomingPayload("text", { body: "Hola" }).content, "Hola");
  assert.equal(incomingPayload("image", { id: "123", caption: "Foto del producto" }).content, "Foto del producto");
  assert.equal(incomingPayload("reaction", { emoji: "👍" }).type, "UNKNOWN");
});

test("simulation does not query ManyChat and the patch preserves auth and delivery isolation", () => {
  assert.equal(incomingPayload("audio", { id: "123" }, "SIMULATOR:media").manychatSubscriberId, "");
  const source = fixture();
  const result = enableInboxMedia(source);
  assert.deepEqual(result.connections, source.connections);
  assert.deepEqual(result.nodes[1].credentials, source.nodes[1].credentials);
  assert.deepEqual(enableInboxMedia(result), result);
  assert.notEqual(source.nodes[1].parameters.specifyBody, "json");
});
