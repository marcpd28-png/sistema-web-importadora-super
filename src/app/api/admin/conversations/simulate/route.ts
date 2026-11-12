import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMessagingOwnerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processIncomingMessage } from "@/lib/messages-service";
import { mapAssistantProduct } from "@/lib/shop-assistant";
import { productQueryTerms } from "@/lib/catalog-query";
import { generateCatalogPdfBundle } from "@/lib/catalog-pdf";
import { matchSimulatorProductImage, parseSimulatorImageDataUrl } from "@/lib/super-bot-simulator-image-match";
import { getSimulatorPaymentImageUrl, isExplicitSimulatorProductInterest, isSimulatorProductAffirmation, isSimulatorQuantityReply, simulatorImageProductQuoteCopy, simulatorPaymentCopy } from "@/lib/super-bot-simulator-payment";
import {
  generateSuperBotSimulatorReply,
  isSuperBotSimulatorAIEnabled,
  type SuperBotSimulatorResult,
} from "@/lib/super-bot-simulator-ai";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  content: z.string().trim().max(1200).default(""),
  imageDataUrl: z.string().max(5_600_000).optional(),
  name: z.string().trim().min(1).max(180).default("Cliente Simulador"),
  sessionKey: z.string().trim().min(1).max(80).default("default"),
}).superRefine((value, context) => {
  if (!value.content && !value.imageDataUrl) context.addIssue({ code: "custom", message: "Escribe un mensaje o adjunta una imagen." });
  if (value.imageDataUrl && !parseSimulatorImageDataUrl(value.imageDataUrl)) {
    context.addIssue({ code: "custom", message: "La imagen debe ser JPG, PNG o WebP y pesar hasta 4 MB." });
  }
});

const productSelect = {
  id: true, slug: true, code: true, externalCode: true, externalId: true, name: true,
  description: true, technicalSpecs: true, brand: true, category: true, categoryId: true,
  imageUrl: true, sourceImageUrl: true, localImageUrl: true, unitPrice: true,
  wholesalePrice: true, wholesaleMinQty: true, boxPrice: true, unitsPerBox: true,
  stockUnits: true, isVisible: true,
  media: { orderBy: { sortOrder: "asc" }, take: 2, select: { type: true, url: true, altText: true, sortOrder: true } },
} as const;

function simulatorSelectedProductCode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  // Every simulator product card is a direct selection target. Its stable
  // code remains metadata-only, never a visible caption.
  return value.productCard === true && typeof value.productCode === "string"
    ? value.productCode
    : null;
}

function simulatorProductCardCode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  return value.productCard === true && typeof value.productCode === "string" ? value.productCode : null;
}

function wantsScopedCatalog(content: string, messages: Array<{ senderType: string; content: string }>) {
  // “Me interesa” refers to the full catalogue when it immediately follows
  // this prompt. Product-card selection is handled only when a card is the
  // latest meaningful bot turn below.
  if (!isSimulatorProductAffirmation(content) && !isExplicitSimulatorProductInterest(content)) return false;
  // Only the latest meaningful bot turn may authorize a document. This keeps
  // a completed JBL line in history without hijacking a later fan selection.
  for (const message of [...messages].reverse()) {
    if (message.senderType !== "BOT" || !message.content.trim()) continue;
    const text = message.content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return /quieres ver el catalogo completo\?/.test(text);
  }
  return false;
}

function scopedCatalogTerms(messages: Array<{ senderType: string; content: string }>) {
  for (const message of [...messages].reverse()) {
    if (message.senderType !== "CUSTOMER") continue;
    const terms = productQueryTerms(message.content);
    // A single grounded category (for example any product family) is a valid
    // filter too; do not silently downgrade its explicit PDF confirmation.
    if (terms.length) return terms.slice(0, 6);
  }
  return [];
}

async function createSimulationReply(
  conversationId: string,
  customerMessageId: string,
  content: string,
  imageDataUrl?: string,
): Promise<{ result: SuperBotSimulatorResult | null; error: string | null }> {
  const [settings, conversation, previousMessages] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { id: 1 } }),
    prisma.conversation.findUnique({ where: { id: conversationId } }),
    prisma.chatMessage.findMany({
      where: {
        conversationId,
        id: { not: customerMessageId },
        senderType: { in: ["CUSTOMER", "BOT"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Cards intentionally have empty captions, so retain enough turns to
      // include the original customer query when a five-card page is shown.
      take: 30,
    }),
  ]);

  // The simulator is intentionally independent from botMasterSwitch: an
  // owner can validate this flow while every public channel remains paused.
  // Its own database switch is checked again after writing the inbound turn,
  // so a concurrently disabled laboratory never creates an automatic reply.
  if (!settings?.botTestEnvironmentEnabled || !conversation?.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") {
    return {
      result: null,
      error: "El entorno de pruebas está deshabilitado o esta sesión ya no está disponible. Inicia una sesión nueva cuando se habilite.",
    };
  }

  const history = previousMessages.reverse().map((message) => ({
    role: message.senderType === "CUSTOMER" ? "user" as const : "assistant" as const,
    text: message.content,
  }));
  let result: SuperBotSimulatorResult;

  if (imageDataUrl) {
    const imageMatch = await matchSimulatorProductImage(imageDataUrl, { enabled: isSuperBotSimulatorAIEnabled() });
    if (imageMatch.status === "matched" && imageMatch.product) {
      result = {
        products: [imageMatch.product],
        text: imageMatch.productIsSellable
          ? simulatorImageProductQuoteCopy(imageMatch.product)
          : "Identifiqué este producto, pero actualmente no está disponible. ¿Quieres que busque una alternativa?",
        provider: "openai",
        model: process.env.SUPER_BOT_MODEL?.trim() || "gpt-6.1-sol",
        fallbackReason: null,
        imageMatch: true,
      };
    } else {
      result = {
        // Match the live-channel rule: an image that cannot be verified is
        // silent for the customer and becomes a human-review item.
        text: "",
        provider: "verified",
        model: null,
        fallbackReason: imageMatch.reason === "not_configured" ? "not_configured" : "invalid_response",
        requiresAdvisor: true,
      };
    }
  } else {
    const selectedCode = [...previousMessages].reverse()
      .map((message) => simulatorSelectedProductCode(message.metadata))
      .find((code): code is string => Boolean(code));
    const isQuantityFollowUp = Boolean(selectedCode && isSimulatorQuantityReply(content));
    const catalogConfirmationPending = wantsScopedCatalog(content, previousMessages);
    // This branch intentionally comes before both card selection and the
    // verified core. A pending complete-catalogue affirmation can never fall
    // through to the core's show-more behavior, even if PDF generation fails.
    if (catalogConfirmationPending) {
      const terms = scopedCatalogTerms(previousMessages);
      if (!terms.length) {
        result = {
          products: [],
          text: "No pude identificar el filtro del catálogo para preparar el PDF. Vuelve a indicarme el producto o categoría.",
          provider: "verified",
          model: null,
          fallbackReason: "catalog_unavailable",
        };
      } else {
        try {
          const label = terms.join(" ");
          const catalog = await generateCatalogPdfBundle({
            slug: `simulador-${terms.join("-").replace(/[^a-z0-9-]/gi, "")}`,
            title: `CATÁLOGO ${label.toUpperCase()}`,
            terms,
          });
          result = {
            products: [],
            text: "Aquí está el catálogo completo.",
            provider: "verified",
            model: null,
            fallbackReason: null,
            documents: catalog.documents.map((document) => ({
              deliveryKey: `simulator:${document.filename}`,
              filename: document.filename,
              mimeType: "application/pdf" as const,
              sizeBytes: document.sizeBytes,
              // The isolated simulator must expose its generated artifact
              // through this local app, never through a production origin.
              url: document.relativeUrl,
            })),
          };
        } catch {
          result = {
            products: [],
            text: "No se pudo preparar el PDF filtrado ahora; revisa que las fotos del catálogo estén disponibles e inténtalo nuevamente.",
            provider: "verified",
            model: null,
            fallbackReason: "catalog_unavailable",
          };
        }
      }
    // A bare “sí” outside a catalogue action must never select an arbitrary
    // first/last card.
    } else if (selectedCode && isExplicitSimulatorProductInterest(content)) {
      const [product, settings, paymentImageUrl] = await Promise.all([
        prisma.product.findFirst({ where: { code: selectedCode, isVisible: true, stockUnits: { gt: 0 }, unitPrice: { gt: 0 } }, select: productSelect }),
        prisma.storeSettings.findUnique({ where: { id: 1 }, select: { currencySymbol: true } }),
        getSimulatorPaymentImageUrl(),
      ]);
      if (product) {
        const card = mapAssistantProduct(product, settings?.currencySymbol ?? "S/");
        result = {
          products: [card],
          paymentImage: paymentImageUrl ? { url: paymentImageUrl, alt: "Métodos de pago de Importaciones Super" } : undefined,
          text: simulatorPaymentCopy(card, Boolean(paymentImageUrl)),
          provider: "verified",
          model: null,
          fallbackReason: null,
          imageMatch: true,
        };
      } else {
        result = await generateSuperBotSimulatorReply({
          message: content,
          productContextCode: selectedCode,
          preferVerifiedReply: isQuantityFollowUp,
          recentMessages: history,
          shownProductCodes: previousMessages.map((message) => simulatorProductCardCode(message.metadata)).filter((code): code is string => Boolean(code)),
        });
      }
    } else {
      result = await generateSuperBotSimulatorReply({
        message: content,
        productContextCode: selectedCode,
        preferVerifiedReply: isQuantityFollowUp,
        recentMessages: history,
        shownProductCodes: previousMessages.map((message) => simulatorProductCardCode(message.metadata)).filter((code): code is string => Boolean(code)),
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const [current, currentSettings] = await Promise.all([
      tx.conversation.findUniqueOrThrow({ where: { id: conversationId } }),
      tx.storeSettings.findUnique({ where: { id: 1 }, select: { botTestEnvironmentEnabled: true } }),
    ]);
    if (!currentSettings?.botTestEnvironmentEnabled || !current.botEnabled || current.assignedUserId || current.status !== "AUTOMATICO") return;
    if (result.requiresAdvisor) {
      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: "REQUIERE_ASESOR", botEnabled: false },
      });
      return;
    }
    // Persist each product image first, then the short bot copy. This mirrors
    // the delivery order a future provider adapter must use and makes the
    // administrative laboratory useful for visual-first validation. Multiple
    // distinct customer images can legitimately yield the same short reply
    // (for example, “¿Te interesa este producto?”), so content-based reply
    // suppression would silently hide every match after the first two.
    const cards = (result.products ?? [])
      .map((product) => ({
        product,
        mediaUrl: product.outboundImageUrl ?? product.imageUrl,
      }))
      .filter((item): item is { product: NonNullable<typeof result.products>[number]; mediaUrl: string } => Boolean(item.mediaUrl));
    if (cards.length) {
      await tx.chatMessage.createMany({
        data: cards.map(({ product, mediaUrl }) => ({
          conversationId,
          direction: "OUTBOUND" as const,
          senderType: "BOT" as const,
          messageType: "IMAGE" as const,
          // The product card carries identity and price visually. Keeping the
          // stored caption empty avoids duplicating product facts below it.
          content: "",
          mediaUrl,
          status: "simulated",
          metadata: { provider: "super_bot", simulation: true, productCode: product.code, productCard: true, alt: product.imageAlt ?? "Producto del catálogo", source: result.imageMatch ? "image-match" : "catalog" },
        })),
      });
    }
    if (result.paymentImage) {
      await tx.chatMessage.create({
        data: {
          conversationId,
          direction: "OUTBOUND",
          senderType: "BOT",
          messageType: "IMAGE",
          content: "",
          mediaUrl: result.paymentImage.url,
          status: "simulated",
          metadata: { provider: "super_bot", simulation: true, paymentMethodsImage: true, alt: result.paymentImage.alt },
        },
      });
    }
    const documents = result.documents ?? (result.document ? [result.document] : []);
    for (const document of documents) await tx.chatMessage.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        senderType: "BOT",
        messageType: "DOCUMENT",
        content: "",
        mediaUrl: document.url,
        status: "simulated",
        metadata: {
          provider: "super_bot",
          simulation: true,
          model: result.model,
          fallbackReason: result.fallbackReason,
          document: document
            ? {
              deliveryKey: document.deliveryKey,
              filename: document.filename,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
            }
            : null,
        },
      },
    });
    await tx.chatMessage.create({
      data: {
        conversationId, direction: "OUTBOUND", senderType: "BOT", messageType: "TEXT", content: result.text,
        status: "simulated", metadata: { provider: "super_bot", simulation: true, model: result.model, fallbackReason: result.fallbackReason },
      },
    });
  });

  return { result, error: null };
}

export async function POST(request: Request) {
  try {
    const session = await getMessagingOwnerSession();
    if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const input = inputSchema.parse(await request.json());
    const settings = await prisma.storeSettings.findUnique({
      where: { id: 1 },
      select: { botTestEnvironmentEnabled: true },
    });
    if (!settings?.botTestEnvironmentEnabled) {
      return NextResponse.json({ error: "El entorno de pruebas está deshabilitado desde Configuración." }, { status: 409 });
    }
    const displayContent = input.content || "Imagen de prueba";
    const incoming = await processIncomingMessage({
      channel: "WEB",
      content: displayContent,
      externalContactId: `SIMULATOR:${input.sessionKey}`,
      externalMessageId: `SIM-CUSTOMER-${randomUUID()}`,
      name: input.name,
      type: input.imageDataUrl ? "IMAGE" : "TEXT",
      mediaUrl: input.imageDataUrl,
      timestamp: new Date().toISOString(),
      metadata: { simulation: true, provider: "super_bot" },
    });
    const simulation = await createSimulationReply(incoming.conversationId, incoming.messageId, displayContent, input.imageDataUrl);
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: incoming.conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    const aiEnabled = isSuperBotSimulatorAIEnabled();

    return NextResponse.json({
      messages,
      conversationId: incoming.conversationId,
      customerMessageId: incoming.messageId,
      automationError: simulation.error,
      automationTriggered: Boolean(simulation.result),
      automationName: simulation.result?.requiresAdvisor
        ? "Super Bot — conversación pendiente de asesor"
        : simulation.result?.provider === "openai"
        ? `Super Bot IA de prueba — ${simulation.result.model}`
        : "Super Bot — catálogo y políticas verificados, sin envíos reales",
      aiSimulation: {
        enabled: aiEnabled,
        provider: simulation.result?.provider ?? null,
        model: simulation.result?.model ?? null,
        fallbackReason: simulation.result?.fallbackReason ?? null,
      },
      pendingSince: simulation.result?.requiresAdvisor ? new Date().toISOString() : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Revisa el mensaje y la sesión de prueba." }, { status: 400 });
    return NextResponse.json({ error: "No se pudo simular la conversación." }, { status: 500 });
  }
}
