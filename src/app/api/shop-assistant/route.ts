import { answerShopAssistant } from "@/lib/shop-assistant";
import type { ShopAssistantRequest } from "@/lib/shop-assistant-types";
import { rewriteAssistantReplyWithOllama } from "@/lib/ollama";
import { createShopAssistantLog } from "@/lib/shop-assistant-log";
import { NextResponse } from "next/server";

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAssistantIntent(input: {
  message: string;
  replyText: string;
  context?: ShopAssistantRequest["context"];
}) {
  const text = normalizeText(`${input.message} ${input.replyText}`);
  const contextIntent = input.context?.lastIntent?.trim();

  if (contextIntent) {
    return contextIntent;
  }

  if (/\b(oferta|ofertas|promo|promocion|promociones|destacado|destacados)\b/.test(text)) {
    return "offers";
  }

  if (/\b(categoria|categorias|rubro|rubros|seccion|secciones)\b/.test(text)) {
    return "categories";
  }

  if (/\b(whatsapp|contacto|horario|hora|pedido|comprar|compra|envio|entrega|delivery|pago|cotizacion|cotizar)\b/.test(text)) {
    return "support";
  }

  if (/\b(similar|parecid|alternativ|relacionad)\b/.test(text)) {
    return "similar";
  }

  if (/\b(barat|econom|menor precio|menos precio|mas barato|más barato)\b/.test(text)) {
    return "cheaper";
  }

  if (/\b(stock|disponible|disponibilidad|queda|quedan|tienes|hay)\b/.test(text)) {
    return "stock";
  }

  if (/\b(regal|cumple|anivers|detalle|sorpresa|navidad|amigo secreto|mama|papa|madre|padre)\b/.test(text)) {
    return "gift";
  }

  if (/\b(\d{2,}[-\s]?\d{2,}|[a-z]{2,}\s*-\s*\d{2,})\b/i.test(input.message)) {
    return "product-code";
  }

  return "search";
}

export async function POST(request: Request) {
  let body: Partial<ShopAssistantRequest> | null = null;

  try {
    body = (await request.json()) as Partial<ShopAssistantRequest>;
    const message = typeof body.message === "string" ? body.message.slice(0, 280) : "";
    const recentMessages = Array.isArray(body.recentMessages)
      ? body.recentMessages
          .filter(
            (item): item is { role: "assistant" | "user"; text: string } =>
              Boolean(item) &&
              (item.role === "assistant" || item.role === "user") &&
              typeof item.text === "string",
      )
      .slice(-6)
      : [];
    const assistantContext = body.context ?? {};
    const sessionId =
      typeof assistantContext.sessionId === "string" && assistantContext.sessionId.trim()
        ? assistantContext.sessionId.trim()
        : null;
    const mergedContextCategorySlug =
      typeof body.contextCategorySlug === "string"
        ? body.contextCategorySlug
        : typeof assistantContext.lastCategory === "string"
          ? assistantContext.lastCategory
          : null;
    const mergedProductContextCode =
      typeof body.productContextCode === "string"
        ? body.productContextCode
        : typeof assistantContext.lastProductCode === "string"
          ? assistantContext.lastProductCode
          : null;

    const reply = await answerShopAssistant({
      message,
      productContextCode: mergedProductContextCode,
      contextCategorySlug: mergedContextCategorySlug,
      recentMessages,
    });

    const ollamaResult = reply.text.trim()
      ? await rewriteAssistantReplyWithOllama({
          userMessage: message,
          baseReply: reply.text,
          products: (reply.products ?? []).map((product) => ({
            id: product.id,
            name: product.name,
            code: product.code,
            price: product.unitPriceValue,
            wholesalePrice: product.wholesalePriceValue,
            stock: product.stockUnits,
            category: product.category,
            specs: product.technicalSpecs ?? null,
          })),
        })
      : { text: "", usedOllama: false };

    const finalReply = ollamaResult.text;
    const intent = detectAssistantIntent({
      message,
      replyText: reply.text,
      context: assistantContext,
    });

    await createShopAssistantLog({
      sessionId,
      userMessage: message,
      baseReply: reply.text,
      finalReply,
      intent,
      usedOllama: ollamaResult.usedOllama,
      ollamaModel: process.env.OLLAMA_MODEL ?? null,
      ollamaLatencyMs: ollamaResult.latencyMs ?? null,
      productsCount: reply.products?.length ?? 0,
      productIds: reply.products?.map((product) => product.id) ?? [],
      error: ollamaResult.error ?? null,
    });

    return NextResponse.json({
      ...reply,
      text: finalReply,
      meta: {
        ...(reply.meta ?? {}),
        intent,
        usedOllama: ollamaResult.usedOllama,
        ollamaModel: process.env.OLLAMA_MODEL ?? null,
        ollamaLatencyMs: ollamaResult.latencyMs ?? null,
        error: ollamaResult.error ?? null,
      },
    });
  } catch (error) {
    const message = typeof body?.message === "string" ? body.message.slice(0, 280) : "";

    if (message) {
      void createShopAssistantLog({
        sessionId:
          typeof body?.context?.sessionId === "string" ? body.context.sessionId : null,
        userMessage: message,
        finalReply: "No pude procesar esa consulta ahora.",
        intent:
          typeof body?.context?.lastIntent === "string" ? body.context.lastIntent : "error",
        usedOllama: false,
        productsCount: 0,
        productIds: [],
        error: error instanceof Error ? error.message : "Assistant endpoint failure",
      });
    }

    return NextResponse.json(
      {
        text: "No pude procesar esa consulta ahora. Intenta con un código, nombre o categoría.",
        suggestedPrompts: [
          "Busca por código",
          "Muéstrame ofertas",
          "¿Cómo envío mi pedido?",
        ],
      },
      { status: 500 },
    );
  }
}
