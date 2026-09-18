import assert from "node:assert/strict";
import test from "node:test";
import { emptyAgenda, planRequests } from "./bc-request-agenda";
import { hasPurchaseIntent } from "./commercial-purchase-language";

const speaker = "PARLANTE JBL PARTYBOX 330 BLACK";
const drone = "DRON DJI AVATA 360 MOTION FLY MORE COMBO";

test("reported purchase keeps two exact products, ordered intent and quantity only on the drone", () => {
  const input = `me interesa este producto ${speaker} lo deseo comprar y tambien ${drone} este quiero 2 unidades de este`;
  const plan = planRequests(emptyAgenda(), [{ id: "original", content: input }]);
  assert.deepEqual(plan.agenda.topics.map(topic => topic.query), [speaker, drone]);
  assert.deepEqual(plan.agenda.requests.map(job => ({ kind: job.kind, quantity: job.quantity, purchase: job.purchaseRequested })), [
    { kind: "PRICE", quantity: null, purchase: true }, { kind: "PRICE", quantity: 2, purchase: true },
  ]);
});

test("purchase phrasing, additions and quantities vary without changing the model numbers", () => {
  for (const verb of ["quiero comprar", "deseo comprar", "quisiera comprar", "me gustaría comprar"]) {
    for (const addition of ["y tambien", "y también", "además"]) {
      const plan = planRequests(emptyAgenda(), [{ id: "variant", content: `${verb} ${speaker} ${addition} ${drone} quiero tres unidades` }]);
      assert.deepEqual(plan.agenda.topics.map(topic => topic.query), [speaker, drone]);
      assert.deepEqual(plan.agenda.requests.map(job => job.quantity), [null, 3]);
    }
  }
  assert.equal(hasPurchaseIntent("no quiero comprar este producto"), false);
  assert.equal(hasPurchaseIntent("no lo deseo comprar"), false);
});

test("purchase spread across messages preserves quantities and explicit follow-up changes", () => {
  const first = planRequests(emptyAgenda(), [
    { id: "a", content: `me interesa este producto ${speaker} lo deseo comprar` },
    { id: "b", content: `y tambien ${drone}` },
    { id: "c", content: "dos unidades" },
    { id: "d", content: "aceptan yape" },
    { id: "e", content: "envíos a Arequipa" },
  ]);
  assert.deepEqual(first.agenda.topics.map(topic => topic.query), [speaker, drone]);
  assert.deepEqual(first.agenda.requests.map(job => job.kind), ["PRICE", "PRICE", "PAYMENT", "SHIPPING"]);
  assert.deepEqual(first.agenda.requests.slice(0, 2).map(job => job.quantity), [null, 2]);
  first.agenda.requests.forEach(job => { job.status = "NEEDS_CLARIFICATION"; });
  const next = planRequests(first.agenda, [{ id: "f", content: "del parlante quiero 1 unidad" }]);
  assert.equal(next.recognized, true);
  assert.equal(next.agenda.requests[0].quantity, 1);
  assert.equal(next.agenda.requests[1].quantity, 2);
});
