import { SPECIFICATION_FIELDS, type AgendaRequest, type AgendaTopic } from "./bc-request-agenda";
import { normalizeCommercialText } from "./commercial-query";
import type { CommercialProduct } from "./commercial-catalog";
import { getLinePricing } from "./pricing";
import { getBotProductImageUrls, isBotProductAvailable } from "./bot-product-availability";
import { customerSocialPlatforms } from "./customer-social-reference";

export type BusinessAnswers = { supportHours: string; storeAddress: string; paymentMethods: string[]; deliveryMethods: string[] };
export type RequestAnswer = { content: string; status: AgendaRequest["status"]; evidence: string[] };

export type ProductScope = { label: string; products: CommercialProduct[] };

/** Identity and availability are separate outcomes. Never conclude that a category
 * does not exist merely because its query or photos could not be resolved. */
export function describeUnavailableScope(scope: ProductScope) {
  if (!scope.products.length) return `🔎 No pude identificar con certeza «${scope.label}». ¿Me indicas la marca, el modelo o el código para afinar la búsqueda?`;
  if (scope.products.every(product => product.stockUnits <= 0)) return `📦 Los productos identificados de ${scope.label} están sin stock en este momento.`;
  if (!scope.products.some(isBotProductAvailable)) return `📷 Encontré productos de ${scope.label} con stock, pero no tienen una foto disponible para el catálogo.`;
  return `📷 Encontré productos de ${scope.label}, pero no pude cargar sus fotos para generar el catálogo. Puedes pedirme que lo reintente.`;
}

export function answerCatalogSelection(selection: { label: string; scopes: ProductScope[] }, included: CommercialProduct[]): RequestAnswer {
  const codes = new Set(included.map(product => product.code));
  const pending = selection.scopes.filter(scope => !scope.products.some(product => codes.has(product.code)));
  return {
    content: [included.length ? `📚 Te comparto el catálogo de ${selection.label}: ${included.length} productos con stock y foto. Disponibilidad consultada ahora.` : "", ...pending.map(describeUnavailableScope)].filter(Boolean).join("\n\n"),
    status: pending.length ? "NEEDS_CLARIFICATION" : "ANSWERED",
    evidence: included.map(product => `Product:${product.id}`),
  };
}

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

export function answerUnresolvedReference(request: AgendaRequest, topic: AgendaTopic | undefined): RequestAnswer | null {
  if (["SHIPPING", "PAYMENT", "STORE"].includes(request.kind) || topic?.selectedCode) return null;
  if (topic?.imageReference && !topic.selectedCode) return {
    content: `Recibí ${topic.imageReference}, pero aún no pude identificar el producto con certeza. Dime su marca, modelo o código para continuar con esta consulta.`,
    status: "NEEDS_CLARIFICATION", evidence: [],
  };
  const platforms = customerSocialPlatforms(`${request.question} ${topic?.query || ""}`);
  if (platforms.length && !topic?.selectedCode) return {
    content: `Recibí tu referencia de ${platforms.join(" y ")}. Aún no he podido ver el contenido del enlace para identificar el producto. Envíame una captura donde se vea, o su marca, modelo o código, y continúo con esta consulta.`,
    status: "NEEDS_CLARIFICATION", evidence: [],
  };
  return null;
}

export function answerProductRequest(request: AgendaRequest, topic: AgendaTopic | undefined, products: CommercialProduct[], options: { photoUnavailable?: boolean; scopes?: ProductScope[] } = {}): RequestAnswer {
  const reference = answerUnresolvedReference(request, topic);
  if (reference) return reference;
  products = products.filter(product => product.isVisible);
  if (topic) { topic.selectedCode = null; topic.shownCodes = []; topic.shownGroups = []; }
  if (topic && options.scopes && options.scopes.length > 1) {
    const answers = options.scopes.map(scope => {
      const scopedTopic = { ...topic, query: scope.label, shownCodes: [] as string[] };
      const answer = answerProductRequest(request, scopedTopic, scope.products, { photoUnavailable: options.photoUnavailable });
      topic.shownCodes.push(...scopedTopic.shownCodes);
      topic.shownGroups!.push({ query: scope.label, codes: scopedTopic.shownCodes });
      return answer;
    });
    topic.shownCodes = [...new Set(topic.shownCodes)];
    return { content: answers.map(answer => answer.content).join("\n\n"), status: answers.every(answer => answer.status === "ANSWERED") ? "ANSWERED" : "NEEDS_CLARIFICATION", evidence: [...new Set(answers.flatMap(answer => answer.evidence))] };
  }
  if (!topic || !products.length) return { content: describeUnavailableScope({ label: topic?.query || request.question, products: [] }), status: "NEEDS_CLARIFICATION", evidence: [] };
  const available = options.photoUnavailable ? [] : products.filter(isBotProductAvailable);
  if (!available.length) {
    const inStock = products.filter(product => product.stockUnits > 0);
    const noPhoto = (options.photoUnavailable && inStock.length > 0) || (inStock.length ? inStock : products).every(product => !getBotProductImageUrls(product).length);
    const availability = !inStock.length
      ? `Este producto actualmente se encuentra sin stock.${noPhoto ? " Tampoco tiene una foto disponible." : ""}`
      : "Este producto actualmente no tiene una foto disponible.";
    return { content: `Sobre «${topic.query}»: ${availability}`, status: "ANSWERED", evidence: products.map(product => `Product:${product.id}:${product.updatedAt.toISOString()}`) };
  }
  products = available;
  if (products.length > 1) {
    const choices = products.slice(0, 8);
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
    const requested = request.fields.flatMap(key => SPECIFICATION_FIELDS.filter(field => field.key === key));
    let missing = false;
    const lines = requested.map(field => {
      const rows = specifications.filter(spec => field.names.test(normalizeCommercialText(spec.name)));
      if (!rows.length) {
        const excerpts = published ? [product.digitalProfile?.descriptionShort, product.digitalProfile?.descriptionFull].filter((value): value is string => Boolean(value))
          .flatMap(value => value.replace(/<[^>]*>/g, " ").split(/\n|(?<=[.!?;])\s+/)).map(value => value.trim())
          .filter(value => value && field.names.test(normalizeCommercialText(value))).slice(0, 2) : [];
        if (excerpts.length) {
          evidence.push(`DigitalProductProfile:${product.id}:${field.key}`);
          return `${field.label} — ficha publicada: ${[...new Set(excerpts)].join(" ")}`;
        }
        missing = true; return `${field.label}: no tengo ese dato confirmado en la ficha publicada.`;
      }
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
