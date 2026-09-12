import crypto from "crypto";

export function verifyMetaSignature({
  rawBody,
  signatureHeader,
  appSecret,
}: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string | undefined;
}) {
  if (!appSecret) return { ok: false, reason: "missing_secret" };
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return { ok: false, reason: "invalid_format" };
  const signature = signatureHeader.substring(7);
  const expectedSignature = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (signature !== expectedSignature) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

export function assertSameLogicalMessage(
  existing: Record<string, unknown>,
  requested: Record<string, unknown>,
): boolean {
  return (
    existing.conversationId === requested.conversationId &&
    existing.direction === "OUTBOUND" &&
    existing.senderType === "AGENT" &&
    existing.messageType === requested.messageType &&
    existing.content === requested.content &&
    (existing.mediaUrl ?? null) === (requested.mediaUrl ?? null)
  );
}

export function mergeMessages<T extends { id?: string | null; clientRequestId?: string | null; createdAt: Date | string }>(
  current: T[],
  incoming: T[],
): T[] {
  const byId = new Map<string, T>();

  for (const message of current) {
    const key = (message.id || message.clientRequestId) as string;
    if (key) byId.set(key, message);
  }

  for (const message of incoming) {
    const key = (message.id || message.clientRequestId) as string;
    if (key) byId.set(key, message);
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
