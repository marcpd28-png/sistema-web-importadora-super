import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const integration = await prisma.whatsappIntegration.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      businessId: true,
      wabaId: true,
      phoneNumberId: true,
      displayPhoneNumber: true,
      verifiedName: true,
      status: true,
      scopes: true,
      lastVerifiedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    configured: Boolean(integration) || Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    source: integration ? "database/oauth" : "env",
    integration,
    webhookSignatureConfigured: Boolean((process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET)?.trim()),
    realSendTested: false,
    realSendLabel: "Envío real: NO PROBADO",
  });
}
