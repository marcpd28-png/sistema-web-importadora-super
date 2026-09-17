import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { getMessageMedia } from "./message-media";

let fetchMedia: typeof import("./whatsapp-message-media").fetchWhatsappMessageMedia;
const media = getMessageMedia({ messageType: "AUDIO", metadata: { phoneNumberId: "123", message: { audio: { id: "456", mime_type: "audio/ogg" } } } });
let lastCredentialQuery: unknown;

before(async () => {
  global.prismaGlobal = {
    whatsappIntegration: { findMany: async (query: unknown) => { lastCredentialQuery = query; return []; } },
  } as unknown as PrismaClient;
  process.env.WHATSAPP_ACCESS_TOKEN = "test-media-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  fetchMedia = (await import("./whatsapp-message-media")).fetchWhatsappMessageMedia;
});

test("descarga audio con credenciales del servidor y conserva los rangos de reproducción", async (t) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return calls.length === 1
      ? Response.json({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?id=456", mime_type: "audio/ogg" })
      : new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-range": "bytes 0-2/20", "content-length": "3", "accept-ranges": "bytes" } });
  });
  const response = await fetchMedia(media, "bytes=0-2");
  assert.match(calls[0].url, /graph.facebook.com\/[^/]+\/456\?phone_number_id=123$/);
  assert.equal(new Headers(calls[0].init?.headers).get("authorization"), "Bearer test-media-token");
  assert.equal(new Headers(calls[1].init?.headers).get("authorization"), "Bearer test-media-token");
  assert.equal(new Headers(calls[1].init?.headers).get("range"), "bytes=0-2");
  assert.equal(calls[1].init?.redirect, "error");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "audio/ogg");
  assert.equal(response.headers.get("content-range"), "bytes 0-2/20");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("authorization"), null);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3]);
  assert.deepEqual((lastCredentialQuery as { where: unknown }).where, { status: "ACTIVE", phoneNumberId: "123" });
});

test("renueva el enlace de Meta cada vez que se abre el sticker", async (t) => {
  let lookups = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL) => {
    if (String(url).includes("graph.facebook.com")) {
      lookups++;
      return Response.json({ url: `https://lookaside.fbsbx.com/file?attempt=${lookups}`, mime_type: "image/webp" });
    }
    return new Response(new Uint8Array([82, 73, 70, 70]));
  });
  for (let index = 0; index < 2; index++) {
    const response = await fetchMedia({ ...media, type: "STICKER" }, null);
    assert.equal(response.headers.get("content-type"), "image/webp");
    await response.arrayBuffer();
  }
  assert.equal(lookups, 2);
});

test("no reenvía el token a enlaces que no pertenecen a Meta", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ url: "https://fbsbx.com.attacker.example/media" });
  });
  await assert.rejects(fetchMedia(media, null), /URL de descarga multimedia inválida/);
  assert.equal(calls, 1);
});

test("no descarga con credenciales de otro número ni con identificadores inválidos", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("No debe invocarse"); });
  await assert.rejects(fetchMedia({ ...media, phoneNumberId: "999" }, null), /No hay credenciales/);
  await assert.rejects(fetchMedia({ ...media, mediaId: "../me" }, null), /Identificador multimedia inválido/);
  assert.equal(mock.mock.callCount(), 0);
});

test("el archivo eliminado o inaccesible produce un error controlado", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL) => String(url).includes("graph.facebook.com")
    ? Response.json({ url: "https://lookaside.fbsbx.com/expired" })
    : new Response("expired", { status: 404 }));
  await assert.rejects(fetchMedia(media, null), /No se pudo descargar/);
});
