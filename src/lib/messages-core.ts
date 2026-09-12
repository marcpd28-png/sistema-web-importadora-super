import crypto from "crypto";

export function verifyMetaSignature({ rawBody, signatureHeader, appSecret }: { rawBody: string, signatureHeader: string | null, appSecret: string | undefined }) {
  if (!appSecret) return { ok: false, reason: "missing_secret" };
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return { ok: false, reason: "invalid_format" };
  const signature = signatureHeader.substring(7);
  const expectedSignature = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (signature !== expectedSignature) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

export function assertSameLogicalMessage(existing: Record<string, unknown>, requested: Record<string, unknown>): boolean {
  return (
    existing.conversationId === requested.conversationId &&
    existing.direction === "OUTBOUND" &&
    existing.senderType === "AGENT" &&
    existing.messageType === requested.messageType &&
    existing.content === requested.content &&
    (existing.mediaUrl ?? null) === (requested.mediaUrl ?? null)
  );
}

export function mergeMessages(current: Record<string, unknown>[], incoming: Record<string, unknown>[]) {
  const map = new Map(current.map(m => [m.id || m.clientRequestId, m]));
  for (const inc of incoming) {
    const key = inc.id || inc.clientRequestId;
    const exist = map.get(key);
    if (exist) {
      // Reconcile status transitions properly.
      // If the incoming message has a resolved status (sent, delivered, read), it takes precedence.
      // Or simply overwrite entirely as backend is authoritative.
      map.set(key, inc);
    } else {
      map.set(key, inc);
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
