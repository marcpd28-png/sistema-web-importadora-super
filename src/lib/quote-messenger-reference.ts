import { createHmac, timingSafeEqual } from "node:crypto";

const REFERENCE_PREFIX = "q";

function signatureFor(quoteId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("No se puede preparar el enlace de Messenger: falta la clave de sesión del servidor.");
  return createHmac("sha256", secret).update(`quote-messenger:${quoteId}`).digest("base64url").slice(0, 22);
}

/** Opaque, tamper-evident payload for a future inbound Messenger adapter.
 * The quote ID is not a customer identifier; the signature binds it to this
 * installation before an adapter may load the internal quotation. */
export function createQuoteMessengerReference(quoteId: string) {
  return `${REFERENCE_PREFIX}.${quoteId}.${signatureFor(quoteId)}`;
}

export function verifyQuoteMessengerReference(reference: string) {
  const match = new RegExp(`^${REFERENCE_PREFIX}\\.([A-Za-z0-9_-]{8,80})\\.([A-Za-z0-9_-]{22})$`).exec(reference);
  if (!match) return null;
  const [, quoteId, signature] = match;
  const expected = signatureFor(quoteId);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer) ? quoteId : null;
}
