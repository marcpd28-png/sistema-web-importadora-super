import { SPECIFICATION_FIELDS, type AgendaRequest, type AgendaTopic } from "./bc-request-agenda";
import { normalizeCommercialText } from "./commercial-query";
import type { CommercialProduct } from "./commercial-catalog";
import { getLinePricing } from "./pricing";

export type BusinessAnswers = { supportHours: string; storeAddress: string; paymentMethods: string[]; deliveryMethods: string[] };
export type RequestAnswer = { content: string; status: AgendaRequest["status"]; evidence: string[] };

export function answerBusinessRequest(request: AgendaRequest, business: BusinessAnswers): RequestAnswer | null {
  const question = normalizeCommercialText(request.question);
  if (request.kind === "SHIPPING") {
    const methods = business.deliveryMethods;
    const requested = /\bshalom\b/.test(question) ? "SHALOM" : /\bolva\b/.test(question) ? "OLVA" : null;
    let content = !methods.length ? "No tengo métodos de entrega confirmados en la configuración. Un asesor debe confirmar el envío."
      : requested ? `${requested}: ${methods.some(method => method.toUpperCase().includes(requested)) ? "sí está entre nuestras modalidades de envío" : `no figura entre las modalidades configuradas; tenemos ${methods.join(", ")}`}.`
      : `Modalidades de entrega: ${methods.join(", ")}.`;
    if (/\b(?:cuanto|costo|precio|demora|dias|llega|cuando)\b/.test(question)) content += " No tengo una tarifa o plazo confirmado para ese destino; queda pendiente confirmarlo con un asesor.";
    else content += " Para confirmar cobertura, costo y plazo necesitamos el destino y la agencia o dirección; no tengo una cotización de transporte registrada.";
    return { content, status: methods.length && requested && !/cuanto|demora|dias|cuando|costo|precio/.test(question) ? "ANSWERED" : "NEEDS_CLARIFICATION", evidence: ["business:deliveryMethods"] };
  }
  if (request.kind === "PAYMENT") return { content: business.paymentMethods.length ? `Métodos de pago: ${business.paymentMethods.join(", ")}.` : "No tengo métodos de pago confirmados. Queda pendiente la confirmación de un asesor.", status: business.paymentMethods.length ? "ANSWERED" : "NEEDS_CLARIFICATION", evidence: ["business:paymentMethods"] };
  if (request.kind === "STORE") return { content: `Dirección: ${business.storeAddress || "pendiente de confirmar"}.\nHorario: ${business.supportHours || "pendiente de confirmar"}.`, status: business.storeAddress && business.supportHours ? "ANSWERED" : "NEEDS_CLARIFICATION", evidence: ["StoreSettings:storeAddress", "StoreSettings:supportHours"] };
  return null;
}

export function answerProductRequest(request: AgendaRequest, topic: AgendaTopic | undefined, products: CommercialProduct[]): RequestAnswer {
  if (!topic || !products.length) return { content: `Sobre «${topic?.query || request.question}»: no pude identificar un producto publicado con esos datos. ¿Puedes indicar el código o modelo exacto?`, status: "NEEDS_CLARIFICATION", evidence: [] };
  if (products.length > 1) {
    const available = products.filter(product => product.stockUnits > 0);
    const choices = (available.length ? available : products).slice(0, 8);
    topic.shownCodes = choices.map(product => product.code);
    return { content: `Para ${topic.query} encontré ${products.length} opciones:\n${choices.map((product, index) => `${index + 1}. ${product.name} — código ${product.code}${product.stockUnits > 0 ? ` — S/ ${Number(product.unitPrice).toFixed(2)}` : " — sin stock"}`).join("\n")}\nIndícame el código del modelo que necesitas${request.kind === "PRICE" ? ` para cotizar ${request.quantity || "la cantidad que deseas de"} unidades` : ""}.`, status: "NEEDS_CLARIFICATION", evidence: choices.map(product => `Product:${product.id}`) };
  }
  const product = products[0];
  topic.selectedCode = product.code;
  topic.shownCodes = [product.code];
  const evidence = [`Product:${product.id}:${product.updatedAt.toISOString()}`];
  const title = `${product.name} (${product.code})`;
  if (request.kind === "STOCK") return { content: `${title}: ${product.stockUnits > 0 ? `${product.stockUnits} unidades disponibles al consultar` : "sin stock actualmente"}.`, status: "ANSWERED", evidence };
  if (request.kind === "PRICE") {
    const quantity = request.quantity || 1;
    if (product.stockUnits < quantity) return { content: `${title}: ${product.stockUnits > 0 ? `hay ${product.stockUnits} unidades, insuficientes para las ${quantity} solicitadas` : "sin stock actualmente"}. No puedo confirmar esa cotización.`, status: "NEEDS_CLARIFICATION", evidence };
    const pricing = getLinePricing({ ...product, unitPrice: Number(product.unitPrice), wholesalePrice: product.wholesalePrice == null ? null : Number(product.wholesalePrice), boxPrice: product.boxPrice == null ? null : Number(product.boxPrice) }, quantity);
    return { content: `${title}\n${quantity} unidad(es): S/ ${pricing.unitPrice.toFixed(2)} cada una. Total: S/ ${pricing.total.toFixed(2)} (${pricing.tierLabel}). Precio y stock consultados ahora.`, status: "ANSWERED", evidence };
  }
  if (request.kind === "INFORMATION") {
    const published = product.digitalProfile?.status === "PUBLICADA";
    const specifications = published ? product.specifications : [];
    const requested = request.fields.length ? SPECIFICATION_FIELDS.filter(field => request.fields.includes(field.key)) : [];
    let missing = false;
    const lines = requested.map(field => {
      const rows = specifications.filter(spec => field.names.test(normalizeCommercialText(spec.name)));
      if (!rows.length) { missing = true; return `${field.label}: no tengo ese dato confirmado en la ficha publicada.`; }
      rows.forEach(spec => evidence.push(`ProductSpecification:${product.id}:${spec.name}`));
      // Return the actual attribute name, preserving RMS/PMPO and native/supported distinctions.
      return rows.map(spec => `${spec.name}: ${spec.value}`).join("\n");
    });
    if (!requested.length) {
      if (published) {
        const description = product.digitalProfile?.descriptionShort || product.digitalProfile?.descriptionFull;
        if (description) lines.push(description);
        lines.push(...specifications.slice(0, 12).map(spec => `${spec.name}: ${spec.value}`));
      }
      if (!lines.length) { missing = true; lines.push("No tengo una ficha técnica publicada para confirmar sus características. Queda pendiente la información de un asesor."); }
    }
    return { content: `${title}\n${[...new Set(lines)].join("\n")}`, status: missing ? "NEEDS_CLARIFICATION" : "ANSWERED", evidence };
  }
  return { content: `${title}\n${product.stockUnits > 0 ? `Disponible: S/ ${Number(product.unitPrice).toFixed(2)} por unidad.` : "Sin stock actualmente."}\nPuedes consultar características, precio por cantidad o solicitar su catálogo.`, status: "ANSWERED", evidence };
}

export function splitAnswerText(content: string, maximum = 3500) {
  const chunks: string[] = [];
  let pending = content;
  while (pending.length > maximum) {
    const boundary = pending.lastIndexOf("\n", maximum);
    const at = boundary > maximum / 2 ? boundary : maximum;
    chunks.push(pending.slice(0, at)); pending = pending.slice(at).trimStart();
  }
  if (pending) chunks.push(pending);
  return chunks;
}
