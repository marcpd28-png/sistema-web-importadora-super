import { timingSafeEqual } from "node:crypto";

export class TelegramBridgeError extends Error {
  constructor(message: string, public readonly statusCode = 502, public readonly uncertain = false) { super(message); }
}

export function telegramAuthorized(header: string | null, secret = process.env.TELEGRAM_BRIDGE_SECRET) {
  if (!secret || secret.length < 32 || !header) return false;
  const actual = Buffer.from(header), expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function telegramBridgeHeaders() {
  const secret = process.env.TELEGRAM_BRIDGE_SECRET;
  if (!secret || secret.length < 32) throw new TelegramBridgeError("La conexión con Telegram no está configurada.", 503);
  return { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
}

export function telegramBridgeUrl(path: string) {
  const base = process.env.TELEGRAM_BRIDGE_URL;
  if (!base) throw new TelegramBridgeError("La conexión con Telegram no está configurada.", 503);
  return `${base.replace(/\/$/, "")}/inbox/${path}`;
}

/**
 * Automatic Super Bot sends use a stricter bridge contract than human
 * replies. Keep the feature fail-closed until the bridge explicitly supports
 * `sender: "BOT"`, idempotent `requestId` echoes, and non-handoff delivery.
 */
export function telegramSuperBotBridgeCompatible(value = process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE) {
  return value === "true";
}

type SuperBotBridgeStatus = {
  connected?: boolean;
  capabilities?: { superBotSendV1?: boolean; superBotControlV1?: boolean };
};

type SuperBotSendResult = {
  messageId: number;
  revision?: number;
  sender?: string;
  protocol?: string;
};

type SuperBotControlResult = {
  revision: number;
  sender?: string;
  protocol?: string;
};

type SuperBotSendInput = {
  connectionId: string;
  chatId: string;
  requestId: string;
  type: string;
  content: string;
  mediaUrl?: string | null;
};

const SUPER_BOT_PROTOCOL = "super-bot-v1";
const SUPER_BOT_CAPABILITY_TTL_MS = 15_000;
const SUPER_BOT_STATUS_TIMEOUT_MS = 2_000;
let superBotCapability: { key: string; ready: boolean; expiresAt: number } | null = null;

/**
 * The environment flag is only an operator acknowledgement. A bridge must
 * also advertise the v1 capability before the app takes control of a chat.
 */
export async function telegramSuperBotBridgeReady() {
  const key = `${process.env.TELEGRAM_BRIDGE_URL || ""}\u0000${process.env.TELEGRAM_BRIDGE_SECRET || ""}\u0000${process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE || ""}`;
  if (!telegramSuperBotBridgeCompatible()) return false;
  if (superBotCapability?.key === key && superBotCapability.expiresAt > Date.now()) return superBotCapability.ready;
  let ready = false;
  try {
    const status = await telegramCommand<SuperBotBridgeStatus>("status", undefined, { timeoutMs: SUPER_BOT_STATUS_TIMEOUT_MS });
    ready = status.connected === true && status.capabilities?.superBotSendV1 === true && status.capabilities?.superBotControlV1 === true;
  } catch { /* A transport error is intentionally indistinguishable from no capability. */ }
  superBotCapability = { key, ready, expiresAt: Date.now() + SUPER_BOT_CAPABILITY_TTL_MS };
  return ready;
}

/**
 * Sends only through the versioned BOT contract. A successful HTTP response
 * without a BOT acknowledgement is still an uncertain delivery and must not
 * be retried automatically.
 */
export async function sendTelegramSuperBot(input: SuperBotSendInput) {
  if (!await telegramSuperBotBridgeReady()) {
    throw new TelegramBridgeError("El bridge de Telegram aún no confirma compatibilidad con Super Bot.", 503);
  }
  const result = await telegramCommand<SuperBotSendResult>("send", {
    ...input,
    sender: "BOT",
    protocol: SUPER_BOT_PROTOCOL,
  });
  if (!Number.isInteger(result.messageId) || result.messageId <= 0 || result.sender !== "BOT" || result.protocol !== SUPER_BOT_PROTOCOL) {
    throw new TelegramBridgeError("Telegram no confirmó una entrega de Super Bot compatible.", 502, true);
  }
  return result;
}

/**
 * Claims a Telegram thread for Super Bot without using the human-adviser
 * control flow. The bridge must acknowledge the same BOT v1 markers as a
 * delivery before the app records local AI ownership.
 */
export async function controlTelegramSuperBot(input: { connectionId: string; chatId: string; expectedRevision: number }) {
  if (!await telegramSuperBotBridgeReady()) {
    throw new TelegramBridgeError("El bridge de Telegram aún no confirma compatibilidad con Super Bot.", 503);
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new TelegramBridgeError("La conversación de Telegram no tiene una revisión válida.", 409);
  const result = await telegramCommand<SuperBotControlResult>("control", {
    ...input,
    botEnabled: false,
    sender: "BOT",
    protocol: SUPER_BOT_PROTOCOL,
  });
  if (!Number.isInteger(result.revision) || result.revision < 0 || result.sender !== "BOT" || result.protocol !== SUPER_BOT_PROTOCOL) {
    throw new TelegramBridgeError("Telegram no confirmó el control de Super Bot compatible.", 502, true);
  }
  return result;
}

export async function telegramCommand<T>(path: string, payload?: unknown, options?: { timeoutMs?: number }): Promise<T> {
  const headers = telegramBridgeHeaders(), url = telegramBridgeUrl(path);
  let response: Response;
  try {
    response = await fetch(url, { method: payload ? "POST" : "GET", headers,
      body: payload ? JSON.stringify(payload) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(options?.timeoutMs ?? 35_000) });
  } catch { throw new TelegramBridgeError("No se pudo confirmar la respuesta de Telegram. Revisa la conversación antes de reenviar.", 502, true); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new TelegramBridgeError(data?.error || "Telegram no pudo completar la operación.", response.status >= 400 ? response.status : 502, !data || Boolean(data?.uncertain));
  return data as T;
}

export function telegramReplyWindow(lastInbound: Date | string | null, now = Date.now()) {
  return Boolean(lastInbound && now - new Date(lastInbound).getTime() < 24 * 60 * 60 * 1000);
}
