import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { graphGet, metaErrorResponse } from "@/lib/meta-whatsapp";
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
    const [business, waba, phone, subscribedApps] = await Promise.all([
      graphGet<Record<string, unknown>>(`/${selected.businessId}?fields=id,name`, credentials.accessToken),
      graphGet<Record<string, unknown>>(`/${selected.wabaId}?fields=id,name`, credentials.accessToken),
      graphGet<Record<string, unknown>>(`/${selected.phoneNumberId}?fields=id,display_phone_number,verified_name`, credentials.accessToken),
      graphGet<Record<string, unknown>>(`/${selected.wabaId}/subscribed_apps`, credentials.accessToken),
    ]);

    const verified = {
      businessAccessible: business.id === selected.businessId,
      wabaAccessible: waba.id === selected.wabaId,
      phoneAccessible: phone.id === selected.phoneNumberId,
      subscribedApp: Array.isArray(subscribedApps.data) && subscribedApps.data.length > 0,
    };

    await prisma.whatsappIntegration.update({ where: { id: selected.id }, data: { lastVerifiedAt: new Date(), status: "ACTIVE" } });

    return NextResponse.json({
      ok: Object.values(verified).every(Boolean),
      verified,
      diagnostics: {
        appId: process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim() || null,
        businessId: selected.businessId,
        wabaId: selected.wabaId,
        phoneNumberId: selected.phoneNumberId,
        tokenSource: credentials.source,
        webhookSignatureConfigured: Boolean((process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET)?.trim()),
        realSendTested: false,
        realSendLabel: "Envío real: NO PROBADO",
      },
      account: { business, waba, phone },
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
