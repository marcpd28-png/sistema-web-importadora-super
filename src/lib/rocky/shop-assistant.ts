import { prisma } from "@/lib/prisma";
import { ASSISTANT_PRODUCT_SELECT, mapAssistantProduct } from "@/lib/shop-assistant";
import type { ShopAssistantReply, ShopAssistantRequest, ShopAssistantProductCard } from "@/lib/shop-assistant-types";
import { buildPublicWhatsappHref } from "@/lib/utils";
import { createToolBackend } from "./backend";
import { memorySchema, type RockyMemory, type LLMProvider } from "./contracts";
import { RockyAIOrchestrator } from "./orchestrator";
import { OllamaLocalProvider } from "./provider";
import { PostgresKnowledge } from "./rag";
import type { ToolBackend } from "./tools";
import { purchaseCommand } from "./purchase-language";

type Dependencies = { backend: ToolBackend; provider?: LLMProvider; cards(ids: string[]): Promise<ShopAssistantProductCard[]> };

function dependencies(): Dependencies {
  const provider = process.env.ROCKY_LLM_ENABLED === "true" ? new OllamaLocalProvider() : undefined;
  return {
    // Public store requests use existing links; they do not generate expensive PDFs.
    backend: createToolBackend(new PostgresKnowledge(), { catalogPdf: false }),
    provider,
    async cards(ids) {
      const products = await prisma.product.findMany({ where: { id: { in: ids }, isVisible: true }, select: ASSISTANT_PRODUCT_SELECT });
      return ids.flatMap(id => {
        const product = products.find(p => p.id === id);
        return product ? [mapAssistantProduct(product, "S/")] : [];
      });
    },
  };
}

export async function answerRockyShopAssistant(input: ShopAssistantRequest, previous?: RockyMemory, deps = dependencies()) {
  const contextCode = input.productContextCode || input.context?.lastProductCode;
  const memory = previous || memorySchema.parse({ productCodes: contextCode ? [contextCode] : [], budget: input.context?.budget ?? null });
  const buying = /\b(?:comprar(?:lo|la)?|lo quiero|me lo llevo|agregar al carrito)\b/i.test(input.message);
  const command = purchaseCommand(input.message);
  // Only reuse the selected product for a quantity-only request or its explicit code.
  const selectedQuantity = command && memory.productCodes.length === 1 &&
    (!command.reference || /^(?:ese|esa|este|esta)$/i.test(command.reference) || command.reference.toUpperCase() === memory.productCodes[0].toUpperCase())
    ? Math.max(1, Math.min(100000, command.quantity)) : null;
  const result = await new RockyAIOrchestrator(deps.backend, deps.provider).chat({
    text: selectedQuantity !== null ? `quiero ${selectedQuantity} unidades, precio ${memory.productCodes[0]}`
      : buying && !command && memory.productCodes.length ? `quiero ${memory.quantity} unidades, precio ${memory.productCodes[0]}` : input.message,
    memory, history: input.recentMessages?.slice(-4).map(m => `${m.role}: ${m.text}`),
  });
  const cards = await deps.cards(result.products.slice(0, 3).map(p => p.id));
  for (const card of cards) card.recommendedQuantity = Math.max(1, Math.min(result.memory.quantity, card.stockUnits));
  const quickActions: NonNullable<ShopAssistantReply["quickActions"]> = [];
  let text = result.reply;
  if (result.catalog) {
    text = result.catalog.scope === "FULL" ? "Aquí tienes el catálogo completo de nuestra tienda. ¿Qué producto buscas?"
      : `Puedes ver el catálogo de ${result.catalog.label} en la tienda. ¿Qué modelo te interesa?`;
    quickActions.push({ label: "Ver catálogo", href: result.catalog.url, accent: true });
  }
  if (result.requiresHuman) {
    // An anonymous web chat cannot claim that a human has already received a handoff.
    text = "Para esta consulta necesitas la ayuda de un asesor. Pulsa «Hablar con un asesor» para continuar por WhatsApp.";
    quickActions.push({ label: "Hablar con un asesor", href: buildPublicWhatsappHref(input.message), accent: true });
  } else if (buying && cards.length) {
    text = "Elige la cantidad en la tarjeta y pulsa «Agregar» para llevarlo a tu carrito. Luego puedes revisar y confirmar tu pedido.";
  }
  const reply: ShopAssistantReply = {
    text, products: cards, quickActions,
    contextProductCode: result.memory.productCodes[0] || null,
    contextCategorySlug: input.contextCategorySlug || null,
    suggestedPrompts: result.requiresHuman ? ["Ver catálogo"] : cards.length ? ["¿Cuál es el precio al por mayor?", "Quiero comprarlo"] : ["Ver catálogo", "Busco un cargador", "¿Cuál es el horario?"],
    meta: { engine: "ROCKY", intent: result.intent, usedOllama: result.tokens !== null, ollamaModel: result.model, ollamaLatencyMs: result.latencyMs },
  };
  return { reply, memory: result.memory };
}
