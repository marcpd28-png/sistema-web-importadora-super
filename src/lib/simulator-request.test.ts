import test from "node:test";
import assert from "node:assert/strict";
import { sendSimulatorRequest } from "./simulator-request";
const hanging: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
  init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
});
test("envío lento termina y permite una siguiente petición", async () => {
  const controller = new AbortController();
  await assert.rejects(sendSimulatorRequest({}, controller, 10, hanging), { name: "TimeoutError" });
  assert.equal(controller.signal.aborted, true);
  const next = await sendSimulatorRequest({ content: "hola" }, new AbortController(), 100, async () => Response.json({ messages: [] }));
  assert.deepEqual(next, { messages: [] });
});
test("dejar de esperar cancela la petición pendiente", async () => {
  const controller = new AbortController();
  const pending = sendSimulatorRequest({}, controller, 1000, hanging);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
test("errores HTML del proxy y errores JSON no quedan como una espera", async () => {
  await assert.rejects(sendSimulatorRequest({}, new AbortController(), 100, async () => new Response("gateway timeout", { status: 504 })), /504/);
  await assert.rejects(sendSimulatorRequest({}, new AbortController(), 100, async () => Response.json({ error: "Servidor ocupado" }, { status: 503 })), /Servidor ocupado/);
});
