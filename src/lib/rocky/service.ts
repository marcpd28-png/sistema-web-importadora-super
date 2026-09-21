import { matchCatalogSourceImage } from "../router-v2-catalog-image-match";
import { identifyCatalogImageCodes, type ImageCodeMatch } from "./image-codes";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { memorySchema, type RockyResult, type RockyMode } from "./contracts";
import { RockyAIOrchestrator } from "./orchestrator";
import { OllamaLocalProvider } from "./provider";
import { createToolBackend } from "./backend";
import { PostgresKnowledge } from "./rag";
import { readCustomerMemory, recallCustomerProduct } from "@/lib/bc-customer-memory";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { isBcLiveContact } from "@/lib/bc-live-policy";
import { lockSimulatorConversation } from "@/lib/simulator-input-batch";
import { productFromOwnUrl } from "./sales";
import sharp from "sharp";
import { redactSensitiveText } from "./guardrails";

export function rockyProvider() { return process.env.ROCKY_LLM_ENABLED === "true" ? new OllamaLocalProvider() : undefined; }
export function rockyKnowledge() { return new PostgresKnowledge(process.env.ROCKY_RAG_VECTOR_ENABLED === "true" ? new OllamaLocalProvider() : undefined); }
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function effectiveMode(mode: string | undefined, conversation: { botEnabled: boolean; assignedUserId: string | null; status: string }): RockyMode {
  if (!conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") return "MANUAL";
  return mode === "AUTO" ? "AUTO" : mode === "MANUAL" ? "MANUAL" : "COPILOT";
}

export async function runRocky(input: { conversationId: string; triggerMessageId: string; simulate?: boolean }) {
  const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, include: {
    contact: { include: { conversationMemory: true, rockyPreferences: true } }, rockySession: true, salesState: true,
  } });
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  if (input.simulate && !conversation.contact.externalId?.startsWith("SIMULATOR:")) throw new Error("SIMULATOR_REQUIRED");
  const trigger = await prisma.chatMessage.findFirst({ where: { id: input.triggerMessageId, conversationId: input.conversationId, senderType: "CUSTOMER", direction: "INBOUND" } });
  if (!trigger) throw new Error("MESSAGE_NOT_FOUND");
  const duplicate = await prisma.rockyRun.findUnique({ where: { triggerMessageId: trigger.id } });
  if (duplicate) return { result: duplicate.result as unknown as RockyResult, duplicate: true };
  const revision = conversation.rockySession?.revision ?? 0;
  const parsedMemory = memorySchema.safeParse(conversation.rockySession?.memory);
  const memory = parsedMemory.success ? parsedMemory.data : memorySchema.parse({ productCodes: conversation.salesState?.selectedProductCode ? [conversation.salesState.selectedProductCode] : [], quantity: conversation.salesState?.quantity || 1 });
  const preferences = conversation.contact.rockyPreferences?.preferences;
  if (Array.isArray(preferences)) memory.needs = [...new Set([...memory.needs, ...preferences.filter((p): p is string => typeof p === "string").map(p => p.slice(0, 120))])].slice(-10);
  const recalled = recallCustomerProduct(readCustomerMemory(conversation.contact.conversationMemory?.state), trigger.content);
  let resolvedProductCode = recalled || undefined;
  if (recalled) memory.productCodes = [recalled];
  const slug = productFromOwnUrl(trigger.content, process.env.NEXT_PUBLIC_SITE_URL || "https://tiendavirtualsuper.com");
  if (slug) {
    const product = await prisma.product.findFirst({ where: { slug, isVisible: true }, select: { code: true } });
    if (product) { memory.productCodes = [product.code]; resolvedProductCode = product.code; }
  }
  const history = await prisma.chatMessage.findMany({ where: { conversationId: conversation.id, createdAt: { lt: trigger.createdAt }, messageType: "TEXT" }, orderBy: { createdAt: "desc" }, take: 4, select: { content: true } });
  const orchestrator = new RockyAIOrchestrator(createToolBackend(rockyKnowledge()), rockyProvider());
  let image: string | undefined;
  let photoMatch: ImageCodeMatch | null = null;
  if (trigger.messageType === "IMAGE" && trigger.mediaUrl?.startsWith("data:image/")) {
    memory.productCodes = [];
    resolvedProductCode = undefined;
    const exactImage = await matchCatalogSourceImage(trigger.mediaUrl, hash => prisma.product.findMany({ where: { isVisible: true, sourceImageContentHash: hash }, select: { code: true }, take: 2 }));
    if (exactImage) photoMatch = { ...exactImage, codes: [exactImage.hints.code] };
    else {
      const visible = await prisma.product.findMany({ where: { isVisible: true }, select: { code: true, name: true } });
      photoMatch = await identifyCatalogImageCodes(trigger.mediaUrl, visible);
    }
    if (photoMatch?.status === "READY") { resolvedProductCode = photoMatch.codes[0]; memory.productCodes = [resolvedProductCode]; }
    try { if (!photoMatch) image = (await sharp(Buffer.from(trigger.mediaUrl.split(",")[1], "base64"), { limitInputPixels: 16000000 }).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString("base64"); }
    catch { /* Invalid images are handled by clarification, never downloaded remotely. */ }
  }
  const result = await orchestrator.chat({ text: redactSensitiveText(trigger.content).slice(0, 1200), memory, history: history.reverse().map(m => redactSensitiveText(m.content)),
    resolvedProductCode, ...(photoMatch && photoMatch.status !== "READY" ? { resolvedProductCodes: photoMatch.codes.slice(0, 6) } : {}),
    ...(image ? { image } : {}) });
  if (trigger.messageType === "IMAGE") {
    if (photoMatch && !result.requiresHuman) {
      result.reply = `${photoMatch.model === "catalog-source-image-sha256" ? "📸 La foto coincide con una imagen de nuestro catálogo." : `📸 Leí el código ${photoMatch.hints.code} en tu imagen.`} ¡Gracias por enviarla! 😊\n${result.reply}\n\nPrecio y stock consultados ahora; pueden diferir de los impresos en la foto.`;
      result.confidenceEvidence.push(photoMatch.model);
      if (photoMatch.status === "MULTIPLE") {
        result.reply = `📸 Identifiqué estos códigos en tu imagen 😊\n\n${result.products.map(product => `🛍️ ${product.name}\nCódigo: ${product.code}\n💰 S/ ${product.unitPrice.toFixed(2)} · 📦 Stock: ${product.stockUnits}`).join("\n\n")}\n\nPrecio y stock consultados ahora. ${photoMatch.codes.length > 6 ? "Te muestro los primeros 6; envía las demás etiquetas por separado para continuar." : "¿De cuáles necesitas más información?"}`;
      }
      if (photoMatch.status === "CHOICES") {
        result.reply = `📸 Leí ${photoMatch.hints.code} en tu imagen 😊 Ese código corresponde a varias referencias o variantes del catálogo:\n${result.products.map(product => `• ${product.code} — ${product.name}`).join("\n")}\n\n¿Cuál es la tuya? Confírmame el color, la versión o el código completo para darte su precio y stock exactos.`;
        result.memory.productCodes = [];
      }
      if (photoMatch.hints.confidence < 0.85) {
        result.confidence = Math.min(result.confidence, photoMatch.hints.confidence);
        result.reply += "\n¿Me confirmas que este es el producto de tu foto?";
      }
    } else if (!result.requiresHuman && result.intent !== "CATALOG_REQUEST") {
      result.reply = result.products.length
        ? `📸 Gracias por la foto 😊 Estas opciones parecen relacionadas, pero aún no confirmo el modelo exacto.\n${result.reply}\n\n¿Reconoces el tuyo? Si puedes, envíame una foto más cercana de la etiqueta o del código.`
        : "📸 ¡Gracias por la foto! 😊 Todavía no puedo confirmar el modelo exacto. Envíame una foto más cercana de la etiqueta o escribe la marca y el código para ayudarte a encontrarlo 🔎";
    }
  }
  if (trigger.messageType === "AUDIO" || trigger.messageType === "VIDEO") {
    result.reply = "Para ayudarte con este archivo necesito una descripción escrita o la revisión de un asesor.";
    result.requiresHuman = true; result.reasonCode = "MEDIA_ADAPTER_UNAVAILABLE";
    result.memory.stage = "HANDOFF";
  }
  const saved = await prisma.$transaction(async tx => {
    // Never hold this lock while running inference. Recheck control, input and revision at commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rocky:${conversation.id}`}))`;
    await lockSimulatorConversation(tx, conversation.id);
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversation.id} FOR UPDATE`;
    const fresh = await tx.conversation.findUniqueOrThrow({ where: { id: conversation.id }, include: { rockySession: true } });
    const existing = await tx.rockyRun.findUnique({ where: { triggerMessageId: trigger.id } });
    if (existing) return { result: existing.result as unknown as RockyResult, duplicate: true };
    if ((fresh.rockySession?.revision ?? 0) !== revision) throw new Error("CONTEXT_CHANGED_RETRY");
    const newest = await tx.chatMessage.findFirst({ where: { conversationId: conversation.id, direction: "INBOUND" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (newest?.id !== trigger.id) throw new Error("NEWER_MESSAGE_RETRY");
    const master = await tx.storeSettings.findFirst({ select: { botMasterSwitch: true } });
    const mode = effectiveMode(fresh.rockySession?.mode, fresh);
    const canSimulate = input.simulate && mode !== "MANUAL" && master?.botMasterSwitch !== false;
    const canQueue = !input.simulate && mode === "AUTO" && process.env.ROCKY_AUTO_ENABLED === "true" && master?.botMasterSwitch !== false && isBcLiveContact(conversation.contact);
    if (result.products.length) {
      const current = await tx.product.findMany({ where: { id: { in: result.products.map(p => p.id) }, isVisible: true }, select: { id: true, stockUnits: true, unitPrice: true, wholesalePrice: true, wholesaleMinQty: true } });
      if (result.products.some(p => !current.some(c => c.id === p.id && c.stockUnits === p.stockUnits && Number(c.unitPrice) === p.unitPrice && (c.wholesalePrice === null ? null : Number(c.wholesalePrice)) === p.wholesalePrice && c.wholesaleMinQty === p.wholesaleMinQty))) throw new Error("INVENTORY_CHANGED_RETRY");
    }
    result.finalAction = result.requiresHuman ? "HANDOFF" : canSimulate ? "SIMULATE" : canQueue ? "QUEUE" : "SUGGEST";
    await tx.rockySession.upsert({ where: { conversationId: conversation.id }, create: { conversationId: conversation.id, mode: "COPILOT", memory: json(result.memory), revision: 1 }, update: { memory: json(result.memory), revision: { increment: 1 } } });
    await tx.rockyRun.create({ data: { id: result.rockyRequestId, conversationId: conversation.id, triggerMessageId: trigger.id, intent: result.intent, skill: result.skill, result: json(result) } });
    // This service never calls an outbound provider. Simulator messages are records only.
    if (canSimulate) await tx.chatMessage.create({ data: { conversationId: conversation.id, senderType: "BOT", direction: "OUTBOUND", messageType: "TEXT", content: result.reply,
      externalMessageId: `rocky-sim:${trigger.id}`, status: "sent", metadata: { agentId: "rocky-simulator", rockyRequestId: result.rockyRequestId } } });
    if (canSimulate && result.catalog?.document) await tx.chatMessage.create({ data: { conversationId: conversation.id, senderType: "BOT", direction: "OUTBOUND", messageType: "DOCUMENT", content: result.catalog.document.name, mediaUrl: result.catalog.document.url,
      externalMessageId: `rocky-catalog:${trigger.id}`, status: "sent", metadata: { agentId: "rocky-simulator", rockyRequestId: result.rockyRequestId } } });
    if (canQueue && !result.requiresHuman) await tx.chatMessage.create({ data: { conversationId: conversation.id, senderType: "BOT", direction: "OUTBOUND", messageType: "TEXT", content: result.reply,
      externalMessageId: `rocky-outbox:${trigger.id}`, status: "bc_queued", metadata: { agentId: "rocky", requestId: result.rockyRequestId, rockyRequestId: result.rockyRequestId, triggerMessageId: trigger.id } } });
    if (result.requiresHuman && (canSimulate || canQueue)) await tx.conversation.update({ where: { id: conversation.id }, data: { botEnabled: false, status: "ATENDIENDO" } });
    return { result, duplicate: false };
  });
  console.info(JSON.stringify({ event: "rocky.completed", rockyRequestId: saved.result.rockyRequestId, conversationId: conversation.id, intent: result.intent, skill: result.skill,
    latency: result.latencyMs, model: result.model, tokens: result.tokens, tools: result.toolCalls, ragResults: result.sources.map(s => s.id), handoff: result.reasonCode, finalAction: result.finalAction }));
  triggerPusherEvent(`chat-${conversation.id}`, "rocky-suggestion", { rockyRequestId: saved.result.rockyRequestId });
  return saved;
}
