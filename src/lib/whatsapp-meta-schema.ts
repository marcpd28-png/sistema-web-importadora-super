import { z } from "zod";

export const embeddedSignupSessionSchema = z.object({
  type: z.string().optional(),
  current_step: z.string().optional(),
  business_id: z.string().trim().min(1).max(120).optional(),
  businessId: z.string().trim().min(1).max(120).optional(),
  waba_id: z.string().trim().min(1).max(120).optional(),
  phone_number_id: z.string().trim().min(1).max(120).optional(),
}).passthrough();

export const embeddedSignupExchangeSchema = z.object({
  authorizationCode: z.string().trim().min(10).max(4096),
  sessionInfo: embeddedSignupSessionSchema,
});

export type EmbeddedSignupSession = z.infer<typeof embeddedSignupSessionSchema>;

export type AuthorizedWhatsappPhone = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
};

export type PhoneSelectionResult =
  | { status: "RESOLVED"; phone: AuthorizedWhatsappPhone }
  | { status: "NO_AUTHORIZED_PHONE"; phones: [] }
  | { status: "PHONE_SELECTION_REQUIRED"; phones: AuthorizedWhatsappPhone[] }
  | { status: "PHONE_ID_NOT_AUTHORIZED"; phones: AuthorizedWhatsappPhone[] };

export function getSessionInfoIds(sessionInfo: EmbeddedSignupSession) {
  return {
    businessId: sessionInfo.business_id ?? sessionInfo.businessId ?? null,
    wabaId: sessionInfo.waba_id ?? null,
    phoneNumberId: sessionInfo.phone_number_id ?? null,
  };
}

export function resolveEmbeddedSignupPhone(
  phoneNumberId: string | null,
  phones: AuthorizedWhatsappPhone[],
): PhoneSelectionResult {
  if (phoneNumberId) {
    const selected = phones.find((phone) => phone.id === phoneNumberId);
    return selected
      ? { status: "RESOLVED", phone: selected }
      : { status: "PHONE_ID_NOT_AUTHORIZED", phones };
  }

  if (phones.length === 1) {
    return { status: "RESOLVED", phone: phones[0] };
  }

  return phones.length === 0
    ? { status: "NO_AUTHORIZED_PHONE", phones: [] }
    : { status: "PHONE_SELECTION_REQUIRED", phones };
}
