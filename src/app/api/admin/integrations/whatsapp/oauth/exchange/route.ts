import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { encryptWhatsappToken } from "@/lib/whatsapp-token-crypto";
import { prisma } from "@/lib/prisma";
import { exchangeMetaAuthorizationCode, extractWhatsappPhoneNumbers, graphGet, metaErrorResponse } from "@/lib/meta-whatsapp";
import { embeddedSignupExchangeSchema, getSessionInfoIds, resolveEmbeddedSignupPhone } from "@/lib/whatsapp-meta-schema";
import { upsertLocalWhatsappIntegration } from "@/lib/whatsapp-integrations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdmin();

  try {
    const input = embeddedSignupExchangeSchema.parse(await request.json());
    const exchanged = await exchangeMetaAuthorizationCode(input.authorizationCode);
    const ids = getSessionInfoIds(input.sessionInfo);

    if (!ids.businessId || !ids.wabaId) {
      throw new Error("Meta no devolvió business_id y waba_id verificables.");
    }

    const [business, waba, phoneNumbersPayload, subscribedApps] = await Promise.all([
      graphGet<Record<string, unknown>>(`/${ids.businessId}?fields=id,name`, exchanged.accessToken),
      graphGet<Record<string, unknown>>(`/${ids.wabaId}?fields=id,name`, exchanged.accessToken),
      graphGet<unknown>(`/${ids.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, exchanged.accessToken),
      graphGet<Record<string, unknown>>(`/${ids.wabaId}/subscribed_apps`, exchanged.accessToken),
    ]);

    if (business.id !== ids.businessId || waba.id !== ids.wabaId) {
      throw new Error("Los identificadores del navegador no coinciden con los recursos autorizados por Meta.");
    }

    const phoneSelection = resolveEmbeddedSignupPhone(ids.phoneNumberId, extractWhatsappPhoneNumbers(phoneNumbersPayload));
    if (phoneSelection.status !== "RESOLVED") {
      return NextResponse.json({
        ok: false,
        status: phoneSelection.status,
        error: phoneSelection.status === "PHONE_SELECTION_REQUIRED"
          ? "Meta devolvió varios teléfonos autorizados y no identificó cuál conectar."
          : phoneSelection.status === "NO_AUTHORIZED_PHONE"
            ? "El WABA no tiene teléfonos autorizados disponibles."
            : "El teléfono informado por Meta no pertenece a los teléfonos autorizados de este WABA.",
        phones: phoneSelection.phones,
      }, { status: 409 });
    }

    const phone = phoneSelection.phone;

    const encryptedToken = encryptWhatsappToken(exchanged.accessToken);
    const data = {
      businessId: ids.businessId,
      wabaId: ids.wabaId,
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.displayPhoneNumber,
      verifiedName: phone.verifiedName,
      accessTokenEncrypted: encryptedToken,
      tokenType: exchanged.tokenType,
      scopes: exchanged.scopes,
      status: "ACTIVE" as const,
      connectedByUserId: session.userId,
      lastVerifiedAt: new Date(),
    };

    const integration = await upsertLocalWhatsappIntegration(
      (args) => prisma.whatsappIntegration.upsert(args as unknown as Parameters<typeof prisma.whatsappIntegration.upsert>[0]),
      data,
    );

    return NextResponse.json({
      ok: true,
      integration: {
        id: integration.id,
        businessId: integration.businessId,
        wabaId: integration.wabaId,
        phoneNumberId: integration.phoneNumberId,
        displayPhoneNumber: integration.displayPhoneNumber,
        verifiedName: integration.verifiedName,
        scopes: integration.scopes,
      },
      subscribedApp: Array.isArray(subscribedApps.data) && subscribedApps.data.length > 0,
      realSendTested: false,
      realSendLabel: "Envío real: NO PROBADO",
    });
  } catch (error) {
    const details = metaErrorResponse(error);
    return NextResponse.json({ ok: false, error: details.message, diagnostics: "diagnostics" in details ? details.diagnostics : undefined }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
