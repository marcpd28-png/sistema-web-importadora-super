import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSimulatorInputBatch } from "@/lib/simulator-input-batch";
import { agendaSchema, emptyAgenda, planRequests } from "@/lib/bc-request-agenda";
import { answerBusinessRequest, answerProductRequest, splitAnswerText } from "@/lib/bc-request-answers";
import { loadCommercialCatalog } from "@/lib/commercial-catalog";
import { generateRequestedCatalogPdf, generateRequestedProductImages } from "@/lib/catalog-pdf";
import { isScreenExtenderQuery } from "@/lib/catalog-selection";
import { normalizeCommercialText, literalProductCodes } from "@/lib/commercial-query";
import { buildPublicUrl } from "@/lib/site-url";
import { POST as persistBatch } from "../simulator-batch/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ conversationId: z.string().min(1).max(191), triggerMessageId: z.string().min(1).max(191) });
const list = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

export async function POST(request: Request) {
  const key = process.env.N8N_INTERNAL_API_KEY;
  if (!key || request.headers.get("x-internal-api-key") !== key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.BC_REQUEST_AGENDA_ENABLED !== "true") return NextResponse.json({ ok: true, handled: false });
  try {
    const input = inputSchema.parse(await request.json());
    const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, select: {
      status: true, botEnabled: true, assignedUserId: true, contact: { select: { externalId: true } },
      requestAgenda: true, salesState: { select: { stage: true } },
    } });
    if (!conversation?.contact.externalId?.startsWith("SIMULATOR:")) return NextResponse.json({ error: "Simulator conversation required" }, { status: 403 });
    if (!conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") return NextResponse.json({ ok: true, handled: true, skipped: "HUMAN_OWNS_CONVERSATION" });
    const batch = await readSimulatorInputBatch(prisma, input.conversationId, input.triggerMessageId);
    if (batch.status !== "READY") return NextResponse.json({ ok: true, handled: true, skipped: batch.status });
    if (batch.media.length) return NextResponse.json({ ok: true, handled: false });
    const text = normalizeCommercialText(batch.content);
    // Existing purchase and human-handoff flows retain ownership of side-effecting operations.
    if (/\b(?:asesor|humano|reclamo|queja|devolucion|comprobante|estado de mi pedido|confirmo|confirmar pedido|quiero comprar|comprar ahora|realizar pedido|no me escribas|no me respondas|deja de responder|deja de escribir|no quiero mensajes|no quiero comprar)\b/.test(text)
      || /^(?:hola|buenos dias|buenas tardes|buenas noches|gracias|ok|si|no|comprar|lo quiero)$/.test(text)
      || (conversation.salesState?.stage && /CUSTOMER|DOCUMENT|DELIVERY|ORDER|PAYMENT|COMPLETED/.test(conversation.salesState.stage) && !/[?¿]|\b(?:catalogo|precio|informacion|garantia|stock|envios|cuanto|horario)\b/.test(batch.content))) {
      return NextResponse.json({ ok: true, handled: false });
    }
    const inbound = await prisma.chatMessage.findMany({ where: { conversationId: input.conversationId, id: { in: batch.messageIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, content: true } });
    const previous = conversation.requestAgenda ? agendaSchema.parse(conversation.requestAgenda.state) : emptyAgenda();
    const plan = planRequests(previous, inbound);
    if (!plan.recognized) return NextResponse.json({ ok: true, handled: false });
    if (plan.agenda.requests.length > 200 || plan.agenda.topics.length > 100) return NextResponse.json({ ok: true, handled: false });
    const settings = await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { supportHours: true, storeAddress: true, botMasterSwitch: true } });
    if (settings?.botMasterSwitch === false) return NextResponse.json({ ok: true, handled: true, skipped: "BOT_DISABLED" });
    const business = { supportHours: settings?.supportHours || "", storeAddress: settings?.storeAddress || "",
      paymentMethods: list(process.env.ROUTER_V2_PAYMENT_METHODS ?? "Yape, Plin, transferencia bancaria"),
      deliveryMethods: list(process.env.ROUTER_V2_DELIVERY_METHODS ?? "DELIVERY, SHALOM, RECOJO") };
    for (let attempt = 0; attempt < 2; attempt++) {
      const agenda = structuredClone(plan.agenda);
      const catalog = await loadCommercialCatalog();
      const touched = new Set(plan.touched);
      // A code chosen from an earlier list resolves only that topic's pending questions.
      for (const topic of agenda.topics.filter(item => !previous.topics.some(old => old.id === item.id))) {
        const codes = literalProductCodes(topic.query, catalog.products.map(product => product.code));
        if (codes.length !== 1) continue;
        const oldTopics = agenda.topics.filter(item => item.id !== topic.id && item.shownCodes.includes(codes[0]) && agenda.requests.some(job => job.topicId === item.id && job.status === "NEEDS_CLARIFICATION"));
        if (oldTopics.length !== 1) continue;
        const old = oldTopics[0];
        old.selectedCode = codes[0]; old.query = codes[0]; agenda.lastTopicId = old.id;
        for (const job of agenda.requests) {
          if (job.topicId === topic.id) job.topicId = old.id;
          if (job.topicId === old.id && job.status === "NEEDS_CLARIFICATION") { job.status = "PENDING"; touched.add(job.id); }
        }
      }
      const replies: { type: "TEXT" | "DOCUMENT" | "IMAGE"; content: string; mediaUrl?: string | null }[] = [];
      const checked = new Set<string>();
      const answered = new Set<string>();
      for (const job of agenda.requests.filter(item => touched.has(item.id))) {
        if (job.status === "CANCELLED") { replies.push({ type: "TEXT", content: "Cancelé la solicitud pendiente de ese producto." }); continue; }
        const topic = agenda.topics.find(item => item.id === job.topicId);
        try {
          if (job.kind === "CATALOG") {
            const query = topic?.query || "catálogo";
            const result = await generateRequestedCatalogPdf(`catálogo ${query}`, false, catalog);
            result.products.forEach(product => checked.add(product.id));
            if (topic) topic.shownCodes = result.products.map(product => product.code);
            const missing = result.unmatchedScopes.length ? `\nSin coincidencias para: ${result.unmatchedScopes.join(", ")}. Indícame el modelo o código de esos productos.` : "";
            replies.push(result.catalog ? { type: "DOCUMENT", mediaUrl: result.catalog.absoluteUrl, content: `Catálogo de ${query}: ${result.catalog.productCount} productos con stock. Disponibilidad consultada al generar este catálogo.${missing}` }
              : { type: "TEXT", content: result.scoped ? `No encontré productos publicados con stock para ${query}. Indícame otra opción o el código exacto.` : `Catálogo completo: ${buildPublicUrl("/")}\nPuedes pedirme un PDF por marca, tipo o modelo.` });
            job.status = result.catalog && !result.unmatchedScopes.length || !result.scoped ? "ANSWERED" : "NEEDS_CLARIFICATION";
            job.evidence = result.products.map(product => `Product:${product.id}`);
          } else if (topic && (isScreenExtenderQuery(topic.query) || /\b(?:fotos?|imagenes?)\b/.test(normalizeCommercialText(job.question)))) {
            const result = await generateRequestedProductImages(topic.selectedCode || topic.query, catalog);
            result.products.forEach(product => checked.add(product.id));
            topic.shownCodes = result.products.map(product => product.code);
            replies.push(...result.outboundMessages);
            if (!result.outboundMessages.length) replies.push({ type: "TEXT", content: `No encontré imágenes de productos disponibles para ${topic.query}. Indícame el código exacto.` });
            job.status = result.outboundMessages.length ? "ANSWERED" : "NEEDS_CLARIFICATION";
            job.evidence = result.products.map(product => `Product:${product.id}`);
          } else {
            const selection = topic ? catalog.search(topic.selectedCode || topic.query, false) : null;
            const products = selection?.products ?? [];
            products.forEach(product => checked.add(product.id));
            const answer = answerBusinessRequest(job, business) ?? answerProductRequest(job, topic, products);
            if (!answered.has(answer.content)) {
              replies.push(...splitAnswerText(answer.content).map(content => ({ type: "TEXT" as const, content })));
              answered.add(answer.content);
            }
            job.status = answer.status; job.evidence = answer.evidence;
          }
          job.answeredBy = job.status === "ANSWERED" ? input.triggerMessageId : null;
        } catch (error) {
          console.error("[bc-requests] subrequest failed", job.kind, error instanceof Error ? error.name : "UnknownError");
          job.status = "PENDING";
          replies.push({ type: "TEXT", content: `Quedó pendiente ${job.kind === "CATALOG" ? "generar el catálogo" : "consultar la información"} de ${topic?.query || "tu consulta"}. Puedes pedirme que lo reintente; las demás respuestas se conservan.` });
        }
      }
      if (!replies.length || replies.length > 90) return NextResponse.json({ ok: true, handled: false });
      const selectedTopic = agenda.topics.find(topic => topic.id === agenda.lastTopicId);
      const selectedQuantity = [...agenda.requests].reverse().find(job => job.topicId === selectedTopic?.id && job.kind === "PRICE")?.quantity ?? null;
      const response = await persistBatch(new Request(new URL("../simulator-batch", request.url), { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": key }, body: JSON.stringify({
        ...input, requestId: `bc:${input.triggerMessageId}`, messages: replies,
        agenda: { expectedRevision: conversation.requestAgenda?.revision ?? 0, state: agendaSchema.parse(agenda) },
        ...(selectedTopic?.selectedCode ? { selection: { code: selectedTopic.selectedCode, quantity: selectedQuantity } } : {}),
        inventory: catalog.products.filter(product => checked.has(product.id)).map(product => ({ id: product.id, stockUnits: product.stockUnits, unitPrice: String(product.unitPrice), wholesalePrice: product.wholesalePrice === null ? null : String(product.wholesalePrice), wholesaleMinQty: product.wholesaleMinQty })),
      }) }));
      const result = await response.json();
      if (result.reason === "INVENTORY_CHANGED" && attempt === 0) continue;
      if (!response.ok) throw new Error("BATCH_PERSISTENCE_FAILED");
      return NextResponse.json({ ...result, handled: true, requestCount: touched.size, pendingCount: agenda.requests.filter(job => job.status === "PENDING" || job.status === "NEEDS_CLARIFICATION").length });
    }
    return NextResponse.json({ ok: false, handled: true, error: "INVENTORY_CHANGED" }, { status: 409 });
  } catch (error) {
    console.error("[bc-requests] failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: error instanceof z.ZodError ? "INVALID_REQUEST_OR_AGENDA" : "REQUEST_PROCESSING_FAILED" }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
