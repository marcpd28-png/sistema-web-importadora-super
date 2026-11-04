import assert from "node:assert/strict";
import test from "node:test";
import { readJsonResponse } from "./http-json";

test("lee respuestas JSON con el content type esperado", async () => {
  const payload = await readJsonResponse<{ ok: boolean }>(Response.json({ ok: true }));

  assert.deepEqual(payload, { ok: true });
});

test("da un error útil cuando una API devuelve una página HTML", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response("<!DOCTYPE html><html></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })),
    /respuesta inesperada.*HTTP 200/,
  );
});

test("da un error útil cuando el cuerpo JSON está dañado", async () => {
  await assert.rejects(
    () => readJsonResponse(new Response("{no-json", {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })),
    /datos no válidos/,
  );
});
