import assert from "node:assert/strict";
import test from "node:test";
import { emptyAgenda, type RequestAgenda } from "./bc-request-agenda";
import { emptyCustomerMemory, frequentCustomerFields, learnCustomerMemory, recallCustomerProduct, readCustomerMemory } from "./bc-customer-memory";

const now = new Date("2026-09-18T10:00:00Z");
function agendas(phrase = "sopladorcito", shownCodes = ["P1", "P2"]): { previous: RequestAgenda; next: RequestAgenda } {
  const previous = emptyAgenda();
  previous.lastTopicId = "topic";
  previous.topics.push({ id: "topic", query: phrase, selectedCode: null, shownCodes });
  const next = structuredClone(previous);
  next.topics[0].selectedCode = "P1";
  next.topics[0].query = "P1";
  return { previous, next };
}
const learn = (content: string, context = agendas()) => learnCustomerMemory({ memory: emptyCustomerMemory(), ...context, conversationId: "c1", messages: [{ messageId: "m1", content }], now });

test("learns a confirmed customer term with traceable evidence and recalls it in later conversations", () => {
  const memory = learn("P1");
  assert.equal(recallCustomerProduct(memory, "SOPLADORCITO", now), "P1");
  assert.deepEqual(memory.aliases[0].sourceMessageIds, ["m1"]);
  assert.equal(memory.aliases[0].conversationId, "c1");
  assert.equal(memory.aliases[0].confirmations, 1);
  assert.equal(recallCustomerProduct(emptyCustomerMemory(), "sopladorcito", now), null, "another contact has no shared aliases");
});

test("unknown terms require explicit correction, never a model's inferred result or a negated selection", () => {
  for (const content of ["no P1", "P2", "quiero precio", "el segundo"]) assert.deepEqual(learn(content).aliases, [], content);
  assert.equal(learn("el primero").aliases[0].code, "P1");
  assert.equal(learn("P1", agendas("sopladorcito", [])).aliases.length, 0);
  assert.equal(learn("me refiero a P1", agendas("sopladorcito", [])).aliases[0].code, "P1");
  assert.equal(learn("P1", agendas("cliente 999888777")).aliases.length, 0);
});

test("conflicting aliases and expired memories ask for clarification instead of guessing", () => {
  const memory = learn("P1");
  memory.aliases.push({ ...memory.aliases[0], code: "P2" });
  assert.equal(recallCustomerProduct(memory, "sopladorcito", now), null);
  assert.equal(recallCustomerProduct(learn("P1"), "sopladorcito", new Date("2027-09-18")), null);
  assert.equal(recallCustomerProduct(learn("P1"), "sopladorcito azul", now), null, "new attributes cannot disappear into an old alias");
  assert.deepEqual(readCustomerMemory({ version: 9, aliases: [] }), emptyCustomerMemory());
});

test("FAQ counts keep only structured interests and exclude canceled and unrelated requests", () => {
  const context = agendas();
  const job = { id: "r1", kind: "INFORMATION" as const, topicId: "topic", question: "¿Cuánto dura? mi teléfono es 999888777", fields: ["autonomia"], quantity: null, sourceMessageIds: ["m1"], status: "ANSWERED" as const, answeredBy: "m1", evidence: [] };
  context.next.requests.push(job, { ...job, id: "r2" }, { ...job, id: "r3", kind: "PAYMENT", status: "CANCELLED" }, { ...job, id: "r4", kind: "STORE", sourceMessageIds: ["unrelated"] });
  const memory = learn("cuanto dura", context);
  assert.deepEqual(memory.questions, [{ kind: "INFORMATION", fields: ["autonomia"], count: 1, lastAskedAt: now.toISOString() }]);
  assert.equal(JSON.stringify(memory).includes("999888777"), false);
  assert.deepEqual(frequentCustomerFields(memory, now), []);
  const again = learnCustomerMemory({ ...context, memory, conversationId: "c2", messages: [{ messageId: "m1", content: "y cuanto dura" }], now });
  assert.deepEqual(frequentCustomerFields(again, now), ["autonomia"]);
  assert.deepEqual(frequentCustomerFields(again, new Date("2027-09-18")), []);
});
