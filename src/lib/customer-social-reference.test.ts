import assert from "node:assert/strict";
import test from "node:test";
import { customerSocialPlatforms } from "./customer-social-reference";
import { commercialClauses } from "./commercial-language";
import { emptyAgenda, planRequests } from "./bc-request-agenda";
import { answerProductRequest, answerUnresolvedReference } from "./bc-request-answers";

test("recognizes social domains without trusting lookalike domains or URL credentials", () => {
  assert.deepEqual(customerSocialPlatforms("https://vm.tiktok.com/Zabc/ https://www.instagram.com/p/abc/ https://fb.watch/abc/"), ["TikTok", "Instagram", "Facebook"]);
  assert.deepEqual(customerSocialPlatforms("https://tiktok.com.evil.example/a https://instagram.com@evil.example/a"), []);
});

test("unresolved social references block catalog and photo generation, but not business answers", () => {
  for (const content of ["catálogo de este https://www.instagram.com/p/prueba/", "fotos de este https://fb.watch/prueba/"]) {
    const plan = planRequests(emptyAgenda(), [{ id: "m", content }]);
    assert.equal(plan.agenda.requests.length, 1);
    const job = plan.agenda.requests[0];
    const topic = plan.agenda.topics.find(item => item.id === job.topicId)!;
    const answer = answerUnresolvedReference(job, topic);
    assert.equal(answer?.status, "NEEDS_CLARIFICATION");
    assert.deepEqual(answer?.evidence, []);
    assert.equal(answerUnresolvedReference(job, { ...topic, selectedCode: "A1" }), null);
    assert.equal(answerUnresolvedReference({ ...job, kind: "PAYMENT" }, undefined), null);
  }
});

test("URL query strings survive clause splitting and unrelated questions stay ordered", () => {
  const url = "https://www.tiktok.com/@tienda/video/123?precio=99&stock=1";
  assert.deepEqual(commercialClauses(`precio de este ${url} y aceptan yape`), [`precio de este ${url}`, "aceptan yape"]);
  const plan = planRequests(emptyAgenda(), ["aceptan yape", `precio de este ${url}`, "seis unidades", "envíos a Arequipa", "gracias"].map((content, i) => ({ id: `m${i}`, content })));
  assert.deepEqual(plan.agenda.requests.map(job => job.kind), ["PAYMENT", "PRICE", "SHIPPING"]);
  const request = plan.agenda.requests[1];
  assert.equal(request.quantity, 6);
  const topic = plan.agenda.topics.find(item => item.id === request.topicId);
  const answer = answerProductRequest(request, topic, []);
  assert.equal(answer.status, "NEEDS_CLARIFICATION");
  assert.match(answer.content, /TikTok/);
  assert.match(answer.content, /captura/);
  assert.deepEqual(answer.evidence, []);
  assert.doesNotMatch(answer.content, /S\/|sin stock/);
});
