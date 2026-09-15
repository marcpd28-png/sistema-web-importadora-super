import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractGrantedPermissions, graphGet, metaErrorResponse } from "@/lib/meta-whatsapp";
import { hasSubscribedMetaApp } from "@/lib/meta-review-checks";
import { resolveWhatsappCredentials } from "@/lib/whatsapp-credentials";

export const dynamic = "force-dynamic";

export async function POST() {
  await requireAdmin();

  try {
    const credentials = await resolveWhatsappCredentials();
    const integration = await prisma.whatsappIntegration.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, businessId: true, wabaId: true, phoneNumberId: true },
    });

    if (!integration && credentials.source === "env") {
      return NextResponse.json({
        ok: false,
        message: "Las credenciales temporales están disponibles, pero falta WABA/business para verificar la conexión.",
        diagnostics: { tokenSource: credentials.source, realSendTested: false, realSendLabel: "Envío real: NO PROBADO" },
      }, { status: 422 });
    }

    const selected = integration!;
    const [waba, phone, subscribedApps, permissionsPayload] = await Promise.all([
      graphGet<Record<string, unknown>>(`/${selected.wabaId}?fields=id,name`, credentials.accessToken),
      graphGet<Record<string, unknown>>(`/${selected.phoneNumberId}?fields=id,display_phone_number,verified_name`, credentials.accessToken),
      graphGet<Record<string, unknown>>(`/${selected.wabaId}/subscribed_apps`, credentials.accessToken),
      graphGet<unknown>("/me/permissions", credentials.accessToken),
    ]);

    const verified = {
      businessLinkedFromSignup: Boolean(selected.businessId),
      wabaAccessible: waba.id === selected.wabaId,
      phoneAccessible: phone.id === selected.phoneNumberId,
      subscribedApp: hasSubscribedMetaApp(subscribedApps, process.env.META_APP_ID),
    };
    const ok = Object.values(verified).every(Boolean);

    const grantedScopes = extractGrantedPermissions(permissionsPayload);
    await prisma.whatsappIntegration.update({
      where: { id: selected.id },
      data: {
        displayPhoneNumber: typeof phone.display_phone_number === "string" ? phone.display_phone_number : undefined,
        lastVerifiedAt: ok ? new Date() : undefined,
        scopes: grantedScopes.length ? grantedScopes : undefined,
        status: "ACTIVE",
        verifiedName: typeof phone.verified_name === "string" ? phone.verified_name : undefined,
      },
    });

    return NextResponse.json({
      ok,
      verified,
      diagnostics: {
        appId: process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim() || null,
        businessId: selected.businessId,
        wabaId: selected.wabaId,
        phoneNumberId: selected.phoneNumberId,
        tokenSource: credentials.source,
        grantedScopes,
        webhookSignatureConfigured: Boolean((process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET)?.trim()),
        realSendTested: false,
        realSendLabel: "Envío real: NO PROBADO",
      },
      account: {
        business: {
          id: selected.businessId,
          name: null,
        },
        waba: {
          id: waba.id,
          name: typeof waba.name === "string" ? waba.name : null,
        },
        phone: {
          id: phone.id,
          displayPhoneNumber: typeof phone.display_phone_number === "string" ? phone.display_phone_number : null,
          verifiedName: typeof phone.verified_name === "string" ? phone.verified_name : null,
        },
      },
    });
  } catch (error) {
    const details = metaErrorResponse(error);
    return NextResponse.json({
      ok: false,
      error: details.message,
      diagnostics: {
        ...("diagnostics" in details ? details.diagnostics : {}),
        tokenSource: "database/oauth or env",
        realSendTested: false,
        realSendLabel: "Envío real: NO PROBADO",
      },
    }, { status: 502 });
  }
}
