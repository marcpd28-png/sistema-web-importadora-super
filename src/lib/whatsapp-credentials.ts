import { prisma } from "@/lib/prisma";
import { decryptWhatsappToken } from "@/lib/whatsapp-token-crypto";

export type WhatsappCredentialSource = "database/oauth" | "env";

export type WhatsappCredentials = {
  accessToken: string;
  phoneNumberId: string;
  source: WhatsappCredentialSource;
  integrationId: string | null;
};

export function selectWhatsappCredentials(
  integration: { accessTokenEncrypted: string; phoneNumberId: string; id: string } | null,
  env: { accessToken?: string; phoneNumberId?: string },
) {
  if (integration) {
    return {
      accessToken: decryptWhatsappToken(integration.accessTokenEncrypted),
      phoneNumberId: integration.phoneNumberId,
      source: "database/oauth" as const,
      integrationId: integration.id,
    };
  }

  const accessToken = env.accessToken?.trim();
  const phoneNumberId = env.phoneNumberId?.trim();

  if (!accessToken || !phoneNumberId) {
    throw new Error("No hay una integración WhatsApp activa ni credenciales temporales configuradas.");
  }

  return { accessToken, phoneNumberId, source: "env" as const, integrationId: null };
}

export function selectDeterministicActiveWhatsappIntegration<T extends { id: string; updatedAt: Date; createdAt: Date }>(integrations: T[]) {
  return [...integrations].sort((a, b) =>
    b.updatedAt.getTime() - a.updatedAt.getTime() ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    b.id.localeCompare(a.id),
  )[0] ?? null;
}

export async function resolveActiveWhatsappCredentials(): Promise<WhatsappCredentials> {
  const integrations = await prisma.whatsappIntegration.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, accessTokenEncrypted: true, phoneNumberId: true, updatedAt: true, createdAt: true },
  });

  const integration = selectDeterministicActiveWhatsappIntegration(integrations);
  return selectWhatsappCredentials(integration, {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  });
}

export const resolveWhatsappCredentials = resolveActiveWhatsappCredentials;
