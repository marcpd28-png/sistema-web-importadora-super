import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  generateProjectorCatalogPdf,
  isProjectorCatalogRequest,
} from "@/lib/catalog-pdf";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  content: z.string().trim().max(10_000),
  conversationId: z.string().trim().min(1).max(191),
  requestId: z.string().trim().min(1).max(191).optional(),
  triggerMessageId: z.string().trim().min(1).max(191).optional(),
});

function isAuthorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY?.trim();
  const provided = request.headers.get("x-internal-api-key")?.trim();
  return Boolean(expected && provided && provided === expected);
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();

  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized", requestId }, { status: 401 });
    }

    const input = requestSchema.parse(await request.json());
    if (!isProjectorCatalogRequest(input.content)) {
      return NextResponse.json({ matched: false, ok: true, requestId });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: {
        assignedUserId: true,
        botEnabled: true,
        contact: {
          select: {
            externalId: true,
            phone: true,
            phoneNormalized: true,
          },
        },
        id: true,
        status: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found", ok: false, requestId },
        { status: 404 },
      );
    }

    const automationAllowed =
      conversation.botEnabled &&
      !conversation.assignedUserId &&
      conversation.status === "AUTOMATICO";

    if (!automationAllowed) {
      return NextResponse.json({
        matched: true,
        ok: true,
        requestId,
        skipped: "HUMAN_OWNS_CONVERSATION",
      });
    }

    const simulation = conversation.contact.externalId?.startsWith("SIMULATOR:") === true;

    const recipient = normalizeWhatsappPhone(
      conversation.contact.phone ??
        conversation.contact.phoneNormalized ??
        conversation.contact.externalId,
    );
    if (!simulation && !recipient) {
      return NextResponse.json(
        {
          error: "INVALID_RECIPIENT",
          matched: true,
          ok: false,
          requestId,
        },
        { status: 422 },
      );
    }

    console.info("[catalog-pdf] generation_started", {
      conversationId: conversation.id,
      requestId,
    });
    const catalog = await generateProjectorCatalogPdf();
    console.info("[catalog-pdf] generation_ready", {
      conversationId: conversation.id,
      generated: catalog.generated,
      productCount: catalog.productCount,
      requestId,
    });

    return NextResponse.json({
      catalog: {
        filename: catalog.filename,
        productCount: catalog.productCount,
        url: catalog.absoluteUrl,
      },
      content: "Aquí tienes el catálogo de proyectores en PDF:",
      conversationId: conversation.id,
      matched: true,
      mediaUrl: catalog.absoluteUrl,
      ok: true,
      recipient: simulation ? null : recipient,
      requestId: input.requestId ?? `catalog:${input.triggerMessageId ?? requestId}`,
      timestamp: new Date().toISOString(),
      type: "document",
      simulation,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", ok: false, requestId },
        { status: 400 },
      );
    }

    console.error("[catalog-pdf] generation_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
      requestId,
    });
    return NextResponse.json(
      { error: "CATALOG_GENERATION_FAILED", ok: false, requestId },
      { status: 500 },
    );
  }
}
