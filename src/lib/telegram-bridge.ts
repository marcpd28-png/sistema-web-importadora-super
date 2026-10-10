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

export async function telegramCommand<T>(path: string, payload?: unknown): Promise<T> {
  const headers = telegramBridgeHeaders(), url = telegramBridgeUrl(path);
  let response: Response;
  try {
    response = await fetch(url, { method: payload ? "POST" : "GET", headers,
      body: payload ? JSON.stringify(payload) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35_000) });
  } catch { throw new TelegramBridgeError("No se pudo confirmar la respuesta de Telegram. Revisa la conversación antes de reenviar.", 502, true); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new TelegramBridgeError(data?.error || "Telegram no pudo completar la operación.", response.status >= 400 ? response.status : 502, !data || Boolean(data?.uncertain));
  return data as T;
}

export function telegramReplyWindow(lastInbound: Date | string | null, now = Date.now()) {
  return Boolean(lastInbound && now - new Date(lastInbound).getTime() < 24 * 60 * 60 * 1000);
}
