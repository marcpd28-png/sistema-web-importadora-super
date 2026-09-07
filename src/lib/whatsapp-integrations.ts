export type WhatsappIntegrationKey = {
  businessId: string;
  wabaId: string;
  phoneNumberId: string;
};

export type WhatsappIntegrationUpsertData = WhatsappIntegrationKey & {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  accessTokenEncrypted: string;
  tokenType: string;
  scopes: string[];
  status: "ACTIVE";
  connectedByUserId: string;
  lastVerifiedAt: Date;
};

export type WhatsappIntegrationUpsertArgs = {
  where: { businessId_wabaId_phoneNumberId: WhatsappIntegrationKey };
  create: WhatsappIntegrationUpsertData;
  update: WhatsappIntegrationUpsertData;
};

export async function upsertLocalWhatsappIntegration<T>(
  upsert: (args: WhatsappIntegrationUpsertArgs) => Promise<T>,
  data: WhatsappIntegrationUpsertData,
): Promise<T> {
  const key = {
    businessId: data.businessId,
    wabaId: data.wabaId,
    phoneNumberId: data.phoneNumberId,
  };

  return upsert({ where: { businessId_wabaId_phoneNumberId: key }, create: data, update: data });
}

export async function disconnectLocalWhatsappIntegration(
  deleteIntegration: (args: { where: { id: string } }) => Promise<unknown>,
  integrationId: string,
) {
  return deleteIntegration({ where: { id: integrationId } });
}
