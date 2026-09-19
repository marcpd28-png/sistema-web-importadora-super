import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const manychatImageAckSchema = z.object({
  requestId: z.string().trim().min(1).max(120),
  subscriberId: z.string().trim().regex(/^\d+$/).max(120),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

export function createManychatImageAckToken(requestId: string, subscriberId: string, secret: string) {
  if (!secret) throw new Error("Missing acknowledgement signing secret");
  return createHmac("sha256", secret)
    .update(JSON.stringify(["manychat-image-ack-v1", requestId, subscriberId]))
    .digest("hex");
}

export function verifyManychatImageAckToken(requestId: string, subscriberId: string, token: string, secret: string) {
  if (!secret || !/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(createManychatImageAckToken(requestId, subscriberId, secret), "hex"));
}
