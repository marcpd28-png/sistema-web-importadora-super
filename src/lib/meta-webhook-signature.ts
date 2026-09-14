import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaWebhookSignatureResult =
  | "VALID"
  | "INVALID"
  | "MISSING_SECRET";

export function verifyMetaWebhookSignature(input: {
  appSecret?: string | null;
  rawBody: string;
  signatureHeader?: string | null;
}): MetaWebhookSignatureResult {
  const appSecret = input.appSecret?.trim();
  if (!appSecret) return "MISSING_SECRET";

  const signature = input.signatureHeader?.trim();
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return "INVALID";
  }

  const received = Buffer.from(signature.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret)
    .update(input.rawBody)
    .digest();

  return received.length === expected.length && timingSafeEqual(received, expected)
    ? "VALID"
    : "INVALID";
}
