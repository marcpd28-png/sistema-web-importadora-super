/** A voice note or a text claim is not a payment receipt. Verification remains external. */
export function hasRouterV2PaymentEvidence(input: { messageType?: string | null; mediaUrl?: string | null }) {
  return Boolean(input.mediaUrl?.trim()) && ["IMAGE", "DOCUMENT"].includes((input.messageType ?? "").toUpperCase());
}
