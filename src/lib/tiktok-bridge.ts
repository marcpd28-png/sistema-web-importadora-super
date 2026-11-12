/**
 * Server-only control client for the standalone TikTok/ChatbotX bridge.
 *
 * The bridge is intentionally optional until TikTok grants Business Messaging
 * access.  A missing configuration is not an error for the adviser UI: there
 * is simply no temporary typing hold to send yet.  When configured, the
 * shared secret stays entirely between the store server and the local bridge.
 */
export class TikTokBridgeError extends Error {
  constructor(message: string, public statusCode = 502) {
    super(message);
  }
}

type TypingResult = { configured: boolean; typing: boolean; typingUntil: number | null };

function bridgeUrl() {
  const raw = process.env.TIKTOK_BRIDGE_URL?.trim();
  const secret = process.env.TIKTOK_BRIDGE_SECRET?.trim();
  if (!raw || !secret) return null;
  if (secret.length < 32) throw new TikTokBridgeError("La conexión de TikTok necesita revisar su configuración.", 503);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TikTokBridgeError("La conexión de TikTok necesita revisar su configuración.", 503);
  }

  // A local sidecar is allowed over loopback; any remote bridge must use HTTPS.
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "localhost";
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password) {
    throw new TikTokBridgeError("La conexión de TikTok necesita revisar su configuración.", 503);
  }
  return { url, secret };
}

function validConversationId(value: string) {
  return /^\d+$/.test(value);
}

/** Send an expiring, non-owning adviser-composition signal to the bridge. */
export async function setTikTokBridgeTyping(conversationId: string, typing: boolean): Promise<TypingResult> {
  if (!validConversationId(conversationId)) throw new TikTokBridgeError("Conversación no válida.", 400);
  const configured = bridgeUrl();
  if (!configured) return { configured: false, typing: false, typingUntil: null };

  const destination = new URL("typing", configured.url.pathname.endsWith("/") ? configured.url : new URL(`${configured.url.pathname}/`, configured.url));
  try {
    const response = await fetch(destination, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tiktok-bridge-key": configured.secret,
      },
      body: JSON.stringify({ conversationId, typing, leaseSeconds: 8 }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new TikTokBridgeError("No se pudo actualizar el indicador de escritura.", response.status === 401 || response.status === 403 ? 503 : 502);
    const body = await response.json().catch(() => null) as { typing?: unknown; typingUntil?: unknown } | null;
    return {
      configured: true,
      typing: body?.typing === true,
      typingUntil: typeof body?.typingUntil === "number" && Number.isFinite(body.typingUntil) ? body.typingUntil : null,
    };
  } catch (error) {
    if (error instanceof TikTokBridgeError) throw error;
    throw new TikTokBridgeError("No se pudo actualizar el indicador de escritura.", 502);
  }
}
