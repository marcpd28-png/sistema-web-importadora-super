import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSimulatorInputBatch } from "@/lib/simulator-input-batch";
import { agendaSchema, emptyAgenda, planRequests } from "@/lib/bc-request-agenda";
import { answerBusinessRequest, answerCatalogSelection, answerProductRequest, answerUnresolvedReference, splitAnswerText } from "@/lib/bc-request-answers";
import { loadCommercialCatalog } from "@/lib/commercial-catalog";
import { generateRequestedCatalogPdf, generateRequestedProductImages } from "@/lib/catalog-pdf";
import { isScreenExtenderQuery } from "@/lib/catalog-selection";
import { normalizeCommercialText, literalProductCodes } from "@/lib/commercial-query";
import { buildPublicUrl } from "@/lib/site-url";
import { POST as persistBatch } from "../simulator-batch/route";
import { customerMemoryEnabled } from "@/lib/bc-customer-memory-store";
import { checkoutOwnsReply } from "@/lib/bc-checkout-routing";
import { matchCatalogSourceImage } from "@/lib/router-v2-catalog-image-match";
import { matchCatalogImageText } from "@/lib/router-v2-local-ocr";
import type { CommercialMessage } from "@/lib/commercial-language";
import { hasPurchaseIntent, splitPurchaseAdditions } from "@/lib/commercial-purchase-language";
import { frequentCustomerFields, readCustomerMemory, recallCustomerProduct } from "@/lib/bc-customer-memory";
import { advanceMultiCart, cartFromAgenda, multiCartSummary } from "@/lib/bc-multi-cart";

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
      status: true, botEnabled: true, assignedUserId: true, contactId: true, contact: { select: { externalId: true } },
      requestAgenda: true, salesState: { select: { stage: true } },
    } });
    if (!conversation?.contact.externalId?.startsWith("SIMULATOR:")) return NextResponse.json({ error: "Simulator conversation required" }, { status: 403 });
    if (!conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") return NextResponse.json({ ok: true, handled: true, skipped: "HUMAN_OWNS_CONVERSATION" });
    const batch = await readSimulatorInputBatch(prisma, input.conversationId, input.triggerMessageId);
    if (batch.status !== "READY") return NextResponse.json({ ok: true, handled: true, skipped: batch.status });
    const previous = conversation.requestAgenda ? agendaSchema.parse(conversation.requestAgenda.state) : emptyAgenda();
    if (process.env.BC_MULTI_CART_ENABLED === "true" && previous.cart && previous.cart.stage !== "CANCELLED") {
      const master = await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { botMasterSwitch: true } });
      if (master?.botMasterSwitch === false) return NextResponse.json({ ok: true, handled: true, skipped: "BOT_DISABLED" });
      const catalog = await loadCommercialCatalog();
      const step = advanceMultiCart({ cart: previous.cart, content: batch.content, products: catalog.products,
        conversationId: input.conversationId, triggerMessageId: input.triggerMessageId,
        voucherMessageId: batch.media.find(m => m.messageType === "IMAGE")?.messageId,
        deliveryMethods: list(process.env.ROUTER_V2_DELIVERY_METHODS ?? "DELIVERY, SHALOM, RECOJO"),
        paymentMethods: list(process.env.ROUTER_V2_PAYMENT_METHODS ?? "Yape, Plin, transferencia bancaria"),
      });
      if (step) {
        const agenda = structuredClone(previous); agenda.cart = step.cart;
        const assignedCodes = new Set<string>();
        for (const job of [...agenda.requests].reverse().filter(job => job.purchaseRequested && job.status !== "CANCELLED")) {
          const topic = agenda.topics.find(topic => topic.id === job.topicId);
          const line = step.cart.lines.find(line => line.code === topic?.selectedCode);
          if (step.cart.stage === "CANCELLED" || !line) job.status = "CANCELLED";
          else if (job.kind === "PRICE" && assignedCodes.has(line.code)) job.status = "CANCELLED";
          else { job.quantity = line.quantity; if (job.kind === "PRICE") assignedCodes.add(line.code); }
        }
        if (step.cart.stage !== "CANCELLED") for (const line of step.cart.lines.filter(line => !assignedCodes.has(line.code))) {
          const topicId = `cart:${line.code}`;
          const topic = agenda.topics.find(topic => topic.id === topicId);
          if (topic) topic.selectedCode = line.code;
          else agenda.topics.push({ id: topicId, query: line.code, selectedCode: line.code, shownCodes: [] });
          const id = `cart:${line.code}:${input.triggerMessageId}`;
          agenda.requests.push({ id, topicId, kind: "PRICE", question: batch.content, quantity: line.quantity,
            fields: [], sourceMessageIds: batch.messageIds, status: "ANSWERED", answeredBy: input.triggerMessageId,
            evidence: [], purchaseRequested: true });
        }
        const codes = new Set(step.cart.lines.map(line => line.code));
        const response = await persistBatch(new Request(new URL("../simulator-batch", request.url), { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": key }, body: JSON.stringify({
          ...input, requestId: `bc:${input.triggerMessageId}`, messages: splitAnswerText(step.reply).map(content => ({ type: "TEXT", content })),
          agenda: { expectedRevision: conversation.requestAgenda?.revision ?? 0, state: agenda },
          inventory: catalog.products.filter(product => codes.has(product.code)).map(product => ({ id: product.id, updatedAt: product.updatedAt.toISOString(), stockUnits: product.stockUnits, unitPrice: String(product.unitPrice), wholesalePrice: product.wholesalePrice === null ? null : String(product.wholesalePrice), wholesaleMinQty: product.wholesaleMinQty })),
        }) }));
        const result = await response.json();
        if (result.reason === "INVENTORY_CHANGED") {
          // The atomic guard rejected all changes. Consume the input with an honest
          // retry prompt, retaining the previous cart and never creating a reference.
          const retry = await persistBatch(new Request(new URL("../simulator-batch", request.url), { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": key }, body: JSON.stringify({
            ...input, requestId: `bc:${input.triggerMessageId}`, messages: [{ type: "TEXT", content: "El inventario cambió durante la consulta. No apliqué este paso ni confirmé el pedido. Repite tu solicitud para revisar el stock y el precio actualizados." }],
          }) }));
          return NextResponse.json({ ...await retry.json(), handled: true, multiCart: true }, { status: retry.status });
        }
        return NextResponse.json({ ...result, handled: true, multiCart: true }, { status: response.status });
      }
    }
    // Single attachments and checkout evidence retain the existing media flow.
    if (batch.media.length && (batch.fragments.length < 2 || batch.media.some(media => media.messageType !== "IMAGE") ||
        conversation.salesState?.stage?.startsWith("AWAITING_") && !["AWAITING_PRODUCT_QUERY", "AWAITING_PURCHASE_CONFIRMATION"].includes(conversation.salesState.stage))) return NextResponse.json({ ok: true, handled: false });
    const text = normalizeCommercialText(batch.content);
    const multiPurchase = hasPurchaseIntent(batch.content) && splitPurchaseAdditions(batch.content).length > 1;
    // Existing purchase and human-handoff flows retain ownership of side-effecting operations.
    if (/\b(?:asesor|humano|reclamo|queja|devolucion|comprobante|estado de mi pedido|confirmo|confirmar pedido|comprar ahora|realizar pedido|no me escribas|no me respondas|deja de responder|deja de escribir|no quiero mensajes|no quiero comprar|no me escriban|no me contacten|dejen de escribirme|no me interesa|cancelar conversacion|detener bot|stop|unsubscribe)\b/.test(text)
      || !multiPurchase && /\bquiero comprar\b/.test(text)
      || /^(?:hola|buenos dias|buenas tardes|buenas noches|gracias|ok|si|no|comprar|lo quiero)$/.test(text)
      || checkoutOwnsReply(conversation.salesState?.stage, batch.content)) {
      return NextResponse.json({ ok: true, handled: false });
    }
    const inbound: CommercialMessage[] = await prisma.chatMessage.findMany({ where: { conversationId: input.conversationId, id: { in: batch.messageIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, content: true } });
    let ocrAttempts = 0;
    for (const [index, media] of batch.media.entries()) {
      const message = inbound.find(item => item.id === media.messageId);
      if (!message) continue;
      let match = await matchCatalogSourceImage(media.mediaUrl, hash => prisma.product.findMany({
        where: { isVisible: true, sourceImageContentHash: hash }, select: { code: true }, take: 2,
      }));
      // Keep long bursts bounded; additional unresolved photos remain explicit pending topics.
      if (!match && ocrAttempts < 2) {
        ocrAttempts++;
        match = await matchCatalogImageText(media.mediaUrl, code => prisma.product.findMany({
          where: { isVisible: true, code }, select: { code: true }, take: 2,
        }));
      }
      message.imageReference = { code: match?.hints.code ?? null, label: `la foto ${index + 1} de este grupo` };
    }
    const initialCatalog = await loadCommercialCatalog();
    let storedMemory = customerMemoryEnabled() ? await prisma.customerConversationMemory.findUnique({ where: { contactId: conversation.contactId } }) : null;
    let memory = customerMemoryEnabled() ? readCustomerMemory(storedMemory?.state) : null;
    const plan = planRequests(previous, inbound, initialCatalog.index);
    if (!plan.recognized) return NextResponse.json({ ok: true, handled: false });
    if (plan.agenda.requests.length > 200 || plan.agenda.topics.length > 100) return NextResponse.json({ ok: true, handled: false });
    const settings = await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { supportHours: true, storeAddress: true, botMasterSwitch: true } });
    if (settings?.botMasterSwitch === false) return NextResponse.json({ ok: true, handled: true, skipped: "BOT_DISABLED" });
    const business = { supportHours: settings?.supportHours || "", storeAddress: settings?.storeAddress || "",
      paymentMethods: list(process.env.ROUTER_V2_PAYMENT_METHODS ?? "Yape, Plin, transferencia bancaria"),
      deliveryMethods: list(process.env.ROUTER_V2_DELIVERY_METHODS ?? "DELIVERY, SHALOM, RECOJO") };
    for (let attempt = 0; attempt < 2; attempt++) {
      const agenda = structuredClone(plan.agenda);
      const catalog = attempt === 0 ? initialCatalog : await loadCommercialCatalog();
      const touched = new Set(plan.touched);
      // A code chosen from an earlier list resolves only that topic's pending questions.
      for (const topic of agenda.topics.filter(item => !previous.topics.some(old => old.id === item.id))) {
        const codes = literalProductCodes(topic.query, catalog.products.map(product => product.code));
        if (codes.length !== 1) continue;
        const explicitCorrection = inbound.some(message => normalizeCommercialText(message.content).trim() === `me refiero a ${normalizeCommercialText(codes[0])}`);
        const oldTopics = agenda.topics.filter(item => item.id !== topic.id && (item.shownCodes.includes(codes[0]) || explicitCorrection && item.id === previous.lastTopicId) && agenda.requests.some(job => job.topicId === item.id && job.status === "NEEDS_CLARIFICATION"));
        if (oldTopics.length !== 1) continue;
        const old = oldTopics[0];
        old.selectedCode = codes[0]; old.query = codes[0]; agenda.lastTopicId = old.id;
        for (const job of agenda.requests) {
          if (job.topicId === topic.id) {
            job.topicId = old.id;
            if (job.kind === "SEARCH") { touched.delete(job.id); job.status = "ANSWERED"; job.answeredBy = input.triggerMessageId; }
          }
          if (job.topicId === old.id && job.status === "NEEDS_CLARIFICATION") { job.status = "PENDING"; touched.add(job.id); }
        }
      }
      const replies: { type: "TEXT" | "DOCUMENT" | "IMAGE"; content: string; mediaUrl?: string | null }[] = [];
      const memoryNotices = new Map<string, string>();
      if (memory) for (const topic of agenda.topics.filter(value => !value.imageReference && !value.selectedCode && agenda.requests.some(job => touched.has(job.id) && job.topicId === value.id))) {
        // Never narrow a valid catalog query using an old purchase or restore an invisible SKU.
        if (catalog.search(topic.query, false).products.length) continue;
        const code = recallCustomerProduct(memory, topic.query);
        if (!code || !catalog.products.some(product => product.code === code)) continue;
        topic.selectedCode = code;
        memoryNotices.set(topic.id, `Antes me confirmaste que «${topic.query}» era el código ${code}. Consulto ese producto; si ahora buscas otro, dime el modelo o envíame una foto.`);
      }
      const checked = new Set<string>();
      const answered = new Set<string>();
      for (const job of agenda.requests.filter(item => touched.has(item.id))) {
        if (job.status === "CANCELLED") { replies.push({ type: "TEXT", content: "Cancelé la solicitud pendiente de ese producto." }); continue; }
        const topic = agenda.topics.find(item => item.id === job.topicId);
        if (topic && memoryNotices.has(topic.id)) {
          replies.push({ type: "TEXT", content: memoryNotices.get(topic.id)! });
          memoryNotices.delete(topic.id);
        }
        try {
          const unresolvedReference = answerUnresolvedReference(job, topic);
          if (unresolvedReference) {
            const answer = unresolvedReference;
            if (!answered.has(answer.content)) replies.push({ type: "TEXT", content: answer.content });
            answered.add(answer.content);
            job.status = answer.status; job.evidence = [];
          } else if (job.kind === "CATALOG") {
            const query = topic?.query || "catálogo";
            const selection = catalog.search(query, false);
            const result = await generateRequestedCatalogPdf(query, false, catalog, selection);
            if (selection.scoped) selection.products.forEach(product => checked.add(product.id));
            if (topic) { topic.shownCodes = result.products.map(product => product.code); topic.shownGroups = []; }
            const answer = answerCatalogSelection(selection, result.products);
            if (!result.catalog || !answered.has(result.catalog.absoluteUrl)) replies.push(result.catalog ? { type: "DOCUMENT", mediaUrl: result.catalog.absoluteUrl, content: answer.content }
              : { type: "TEXT", content: result.scoped ? answer.content : `📚 Catálogo completo: ${buildPublicUrl("/")}\nPuedes pedirme un PDF por marca, tipo o modelo.` });
            if (result.catalog) answered.add(result.catalog.absoluteUrl);
            job.status = result.scoped ? answer.status : "ANSWERED";
            job.evidence = answer.evidence;
          } else if (topic && (isScreenExtenderQuery(topic.query) || /\b(?:fotos?|imagenes?)\b/.test(normalizeCommercialText(job.question)))) {
            const result = await generateRequestedProductImages(topic.selectedCode || topic.query, catalog);
            result.products.forEach(product => checked.add(product.id));
            topic.shownCodes = result.products.map(product => product.code);
            replies.push(...result.outboundMessages);
            let unavailableAnswer;
            if (!result.outboundMessages.length) {
              const matches = catalog.search(topic.selectedCode || topic.query, false).products;
              matches.forEach(product => checked.add(product.id));
              unavailableAnswer = answerProductRequest(job, topic, matches, { photoUnavailable: true });
              replies.push({ type: "TEXT", content: unavailableAnswer.content });
            }
            job.status = result.outboundMessages.length ? "ANSWERED" : unavailableAnswer!.status;
            job.evidence = unavailableAnswer?.evidence ?? result.products.map(product => `Product:${product.id}`);
          } else {
            const selection = topic ? catalog.search(topic.selectedCode || topic.query, false) : null;
            const products = selection?.products ?? [];
            products.forEach(product => checked.add(product.id));
            const answer = answerBusinessRequest(job, business) ?? answerProductRequest(job, topic, products, { scopes: selection?.scopes });
            if (!answered.has(answer.content)) {
              replies.push(...splitAnswerText(answer.content).map(content => ({ type: "TEXT" as const, content })));
              answered.add(answer.content);
            }
            job.status = answer.status; job.evidence = answer.evidence;
            const recurringFields = memory ? frequentCustomerFields(memory) : [];
            if (job.kind === "SEARCH" && topic?.selectedCode && products.length === 1 && recurringFields.length &&
              !agenda.requests.some(other => touched.has(other.id) && other.topicId === topic.id && other.kind === "INFORMATION")) {
              const detail = answerProductRequest({ ...job, kind: "INFORMATION", fields: recurringFields }, { ...topic }, products);
              // Answer recurrent interests only from the current published product facts.
              // These proactive details are not fed back into the customer's question counts.
              if (detail.status === "ANSWERED" && !answered.has(detail.content)) {
                replies.push(...splitAnswerText(detail.content).map(content => ({ type: "TEXT" as const, content })));
                answered.add(detail.content);
                job.evidence = [...new Set([...job.evidence, ...detail.evidence])];
              }
            }
          }
          job.answeredBy = job.status === "ANSWERED" ? input.triggerMessageId : null;
        } catch (error) {
          console.error("[bc-requests] subrequest failed", job.kind, error instanceof Error ? error.name : "UnknownError");
          job.status = "PENDING";
          replies.push({ type: "TEXT", content: `Quedó pendiente ${job.kind === "CATALOG" ? "generar el catálogo" : "consultar la información"} de ${topic?.query || "tu consulta"}. Puedes pedirme que lo reintente; las demás respuestas se conservan.` });
        }
      }
      if (process.env.BC_MULTI_CART_ENABLED === "true" && !agenda.cart?.orderNumber) {
        const cart = cartFromAgenda(agenda, catalog.products);
        if (cart && JSON.stringify(cart.lines) !== JSON.stringify(agenda.cart?.lines)) {
          agenda.cart = cart;
          replies.push(...splitAnswerText(multiCartSummary(cart)).map(content => ({ type: "TEXT" as const, content })));
          cart.lines.forEach(line => { const product = catalog.products.find(p => p.code === line.code); if (product) checked.add(product.id); });
        }
      }
      if (!replies.length || replies.length > 90) return NextResponse.json({ ok: true, handled: false });
      const selectedTopic = agenda.topics.find(topic => topic.id === agenda.lastTopicId);
      const purchaseTopics = new Set(agenda.requests.filter(job => job.purchaseRequested && job.status !== "CANCELLED").map(job => job.topicId));
      const selectedQuantity = [...agenda.requests].reverse().find(job => job.topicId === selectedTopic?.id && job.kind === "PRICE")?.quantity ?? null;
      const response = await persistBatch(new Request(new URL("../simulator-batch", request.url), { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": key }, body: JSON.stringify({
        ...input, requestId: `bc:${input.triggerMessageId}`, messages: replies,
        ...(memory ? { customerMemoryRevision: storedMemory?.revision ?? 0 } : {}),
        agenda: { expectedRevision: conversation.requestAgenda?.revision ?? 0, state: agendaSchema.parse(agenda) },
        ...(selectedTopic && purchaseTopics.size < 2 && (!agenda.cart || agenda.cart.stage === "CANCELLED") ? { selection: { code: selectedTopic.selectedCode, quantity: selectedQuantity } } : {}),
        inventory: catalog.products.filter(product => checked.has(product.id)).map(product => ({ id: product.id, updatedAt: product.updatedAt.toISOString(), stockUnits: product.stockUnits, unitPrice: String(product.unitPrice), wholesalePrice: product.wholesalePrice === null ? null : String(product.wholesalePrice), wholesaleMinQty: product.wholesaleMinQty })),
      }) }));
      const result = await response.json();
      if (result.reason === "INVENTORY_CHANGED" && attempt === 0) continue;
      if (result.reason === "CUSTOMER_MEMORY_CHANGED" && attempt === 0) {
        storedMemory = await prisma.customerConversationMemory.findUnique({ where: { contactId: conversation.contactId } });
        memory = readCustomerMemory(storedMemory?.state);
        continue;
      }
      if (!response.ok) throw new Error("BATCH_PERSISTENCE_FAILED");
      return NextResponse.json({ ...result, handled: true, requestCount: touched.size, pendingCount: agenda.requests.filter(job => job.status === "PENDING" || job.status === "NEEDS_CLARIFICATION").length });
    }
    return NextResponse.json({ ok: false, handled: true, error: "INVENTORY_CHANGED" }, { status: 409 });
  } catch (error) {
    console.error("[bc-requests] failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: error instanceof z.ZodError ? "INVALID_REQUEST_OR_AGENDA" : "REQUEST_PROCESSING_FAILED" }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
