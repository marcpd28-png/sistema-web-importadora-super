import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  N8nOutboundError,
  sendN8nOutboundMessage,
  type N8nOutboundMessageInput,
} from "./n8n-outbound";

const ENV_KEYS = ["N8N_OUTBOUND_WEBHOOK_URL", "N8N_OUTBOUND_API_KEY"] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function configureOutbound() {
  process.env.N8N_OUTBOUND_WEBHOOK_URL = "https://n8n.example.test/webhook/chat-outbound";
  process.env.N8N_OUTBOUND_API_KEY = "test-key";
}

function input(overrides: Partial<N8nOutboundMessageInput> = {}): N8nOutboundMessageInput {
  return {
    agentId: "agent-1",
    channel: "WHATSAPP",
    content: "Mensaje de prueba",
    conversationId: "conversation-1",
    mediaUrl: null,
    recipient: "999999999",
    type: "TEXT",
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("rechaza la configuración outbound incompleta", async () => {
  delete process.env.N8N_OUTBOUND_WEBHOOK_URL;
  delete process.env.N8N_OUTBOUND_API_KEY;

  await assert.rejects(
    sendN8nOutboundMessage(input()),
    (error: unknown) =>
      error instanceof N8nOutboundError &&
      error.code === "N8N_NOT_CONFIGURED" &&
      error.statusCode === 503,
  );
});

test("conserva el error remoto 401, 403 o 500 sin exponer secretos", async () => {
  configureOutbound();

  for (const status of [401, 403, 500]) {
    await assert.rejects(
      sendN8nOutboundMessage(input(), {
        fetchImpl: async () => jsonResponse(status, { error: `remote-${status}` }),
      }),
      (error: unknown) =>
        error instanceof N8nOutboundError &&
        error.code === "N8N_REMOTE_ERROR" &&
        error.statusCode === 502 &&
        error.remoteStatus === status &&
        !error.message.includes("test-key"),
    );
  }
});

test("convierte timeout en error controlado", async () => {
  configureOutbound();

  await assert.rejects(
    sendN8nOutboundMessage(input(), {
      timeoutMs: 5,
      fetchImpl: async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    }),
    (error: unknown) =>
      error instanceof N8nOutboundError &&
      error.code === "N8N_TIMEOUT" &&
      error.statusCode === 504,
  );
});

test("envía el contrato TEXT con header, requestId y teléfono normalizado", async () => {
  configureOutbound();
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  const result = await sendN8nOutboundMessage(input(), {
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return jsonResponse(200, {
        messageId: "wamid.test-text",
        ok: true,
        provider: "meta-cloud",
      });
    },
  });

  const payload = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestUrl, "https://n8n.example.test/webhook/chat-outbound");
  assert.equal(requestInit?.method, "POST");
  assert.equal(headers.get("x-internal-api-key"), "test-key");
  assert.equal(payload.channel, "WHATSAPP");
  assert.equal(payload.recipient, "51999999999");
  assert.equal(payload.type, "TEXT");
  assert.equal(payload.mediaUrl, null);
  assert.match(String(payload.requestId), /^[0-9a-f-]{36}$/);
  assert.equal(result.messageId, "wamid.test-text");
  assert.equal(result.provider, "meta-cloud");
});

test("acepta IMAGE, VIDEO y DOCUMENT con mediaUrl", async () => {
  configureOutbound();

  for (const type of ["IMAGE", "VIDEO", "DOCUMENT"] as const) {
    let payload: Record<string, unknown> | undefined;
    const result = await sendN8nOutboundMessage(input({
      mediaUrl: `https://tiendavirtualsuper.com/uploads/${type.toLowerCase()}.bin`,
      type,
    }), {
      fetchImpl: async (_url, init) => {
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(200, { messageId: `wamid.test-${type}`, ok: true, provider: "meta-cloud" });
      },
    });

    assert.equal(payload?.type, type);
    assert.equal(payload?.mediaUrl, `https://tiendavirtualsuper.com/uploads/${type.toLowerCase()}.bin`);
    assert.equal(result.messageId, `wamid.test-${type}`);
  }
});

test("no considera exitoso un 200 sin confirmación válida de Meta", async () => {
  configureOutbound();

  await assert.rejects(
    sendN8nOutboundMessage(input(), {
      fetchImpl: async () => jsonResponse(200, { ok: false, error: "Meta rechazó el mensaje" }),
    }),
    (error: unknown) =>
      error instanceof N8nOutboundError && error.code === "N8N_INVALID_RESPONSE",
  );
});
