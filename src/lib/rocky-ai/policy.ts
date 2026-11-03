import { createHash } from "node:crypto";
import { z } from "zod";

export const channels = ["whatsapp", "telegram", "messenger", "instagram", "tiktok"] as const;
export const modes = ["OFF", "COPILOT", "HYBRID", "AUTO"] as const;
export const defaultPricingPolicy = "Trabajamos con precios publicados por unidad y por mayor según la cantidad indicada. No aplicamos descuentos adicionales. La presentación por cajón se cotiza sólo cuando la solicites y esté disponible.";
export type AiChannel = typeof channels[number];
export type AiMode = typeof modes[number];
export const targetSchema = z.object({ channel: z.enum(channels), externalId: z.string().min(1).max(180).regex(/^[a-zA-Z0-9:_-]+$/) });
export const settingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string().regex(/^[a-zA-Z0-9._-]+$/).max(80),
  dailyRequests: z.number().int().min(1).max(10000),
  dailyTokens: z.number().int().min(10000).max(10000000),
  maxOutputTokens: z.number().int().min(300).max(1500),
  channelDefaults: z.object({
    whatsapp: z.enum(modes).default("OFF"), telegram: z.enum(modes).default("OFF"),
    messenger: z.enum(modes).default("OFF"), instagram: z.enum(modes).default("OFF"), tiktok: z.enum(modes).default("OFF"),
  }),
  policies: z.object({
    hours: z.string().max(600), shipping: z.string().max(600),
    location: z.string().max(600), payment: z.string().max(1200), returns: z.string().max(600), pricing: z.string().max(600).default(defaultPricingPolicy),
  }),
});
export type Policies = z.infer<typeof settingsSchema>["policies"];
export type ProductFact = {
  id: string;
  name: string;
  code: string;
  price: number;
  stock: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number;
  boxPrice?: number | null;
  unitsPerBox?: number | null;
  /** A catalog-managed photo only; it is never supplied by the model. */
  imageUrl?: string | null;
};
export type ProductPresentation = {
  id: string;
  name: string;
  code: string;
  price: number;
  imageUrl: string | null;
};
export type PaymentPresentation = {
  imageUrl: string;
  alt: string;
};
export const officialPaymentImagePath = "/uploads/communications/metodos-pago-importaciones-super-20260929-v2.jpeg";
export const catalogDecisionSchema = z.object({
  // Catalog requests are resolved by the server from an immutable storefront
  // snapshot. These fields record that server decision; they are not facts the
  // language model is allowed to invent.
  state: z.enum(["ready", "clarify", "empty"]),
  scopeKey: z.string().max(180).nullable(),
  title: z.string().max(180).nullable(),
  productCount: z.number().int().min(0).max(10000),
  message: z.string().max(1000).nullable(),
});
export type CatalogDecision = z.infer<typeof catalogDecisionSchema>;
export const decisionSchema = z.object({
  intent: z.enum(["greeting", "product", "browse", "recommendation", "catalog", "policy", "clarify", "handoff"]),
  productIds: z.array(z.string()).max(3),
  quantity: z.number().int().min(1).max(10000),
  // Strict Structured Outputs requires every property to be present. `null`
  // explicitly means the regular unit/wholesale pricing flow applies.
  priceMode: z.enum(["UNIT", "BOX"]).nullable(),
  policyKey: z.enum(["hours", "shipping", "location", "payment", "returns", "pricing", "none"]),
  reason: z.enum(["routine", "ambiguous", "human_requested", "complaint", "negotiation", "unsupported"]),
  // Strict Structured Outputs requires every property to be present. Only the
  // server creates a non-null catalog payload after validating the request.
  catalog: catalogDecisionSchema.nullable(),
});
export type Decision = z.infer<typeof decisionSchema>;
export type HistoryItem = { id: string; role: "user" | "assistant"; text: string; at: string; attachment?: boolean };
const simulationHistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(600),
  // The simulator only sends this after the server verified the product in a
  // preceding turn. It is fetched afresh before it can affect a quote.
  selectedProductId: z.string().trim().min(1).max(191).optional(),
}).strict();
export const simulationHistorySchema = z.array(simulationHistoryTurnSchema).min(1).max(12);
export type SimulationHistoryTurn = z.infer<typeof simulationHistoryTurnSchema>;
export type Snapshot = { triggerId: string; contextHash: string; history: HistoryItem[]; owned: boolean; canSend: boolean; reason?: string };
export function targetKey(channel: AiChannel, externalId: string) { return `${channel}:${externalId}`; }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function maskPersonalData(text: string) {
  return text.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[correo]")
    // Covers phone numbers, documents and Peruvian CCI/account formats, even
    // when they contain separators. Product codes remain outside this pattern.
    .replace(/(?<!\w)(?:\+?\d[\s()-]*){9,30}(?!\w)/g, "[teléfono o documento]");
}
export function needsHuman(text: string) {
  return /\b(asesor[a]?|humano|persona|reclamo|estafa|devolucion|reembolso|denuncia|comprobante|ya pague)\b/i.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}
function catalogAcknowledgement(title: string) {
  // The delivery worker sends the actual document after this acknowledgement.
  // Keep the acknowledgement brief and do not promise a number of PDF parts.
  return `Preparando tu ${title.toLowerCase()} en PDF.`;
}

function productReference(product: ProductFact) {
  const code = product.code.trim();
  return code && !product.name.toLowerCase().includes(code.toLowerCase()) ? `${product.name} (${code})` : product.name;
}
function productPresentation(product: ProductFact): ProductPresentation {
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    price: product.price,
    imageUrl: product.imageUrl ?? null,
  };
}
export type RenderedDecision = {
  text: string;
  safe: boolean;
  reason: string;
  product?: ProductPresentation;
  recommendations?: ProductPresentation[];
  payment?: PaymentPresentation;
  awaitingQuantity?: boolean;
};

export function requestedQuantity(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const units = "(?:unidades?|unds?|und|piezas?|pieza|pcs?)";
  const exact = normalized.match(new RegExp(`^(\\d{1,4})(?:\\s*${units})?[.!?]*$`));
  const withUnit = normalized.match(new RegExp(`\\b(\\d{1,4})\\s*${units}\\b`));
  const amount = Number(exact?.[1] ?? withUnit?.[1] ?? 0);
  return Number.isInteger(amount) && amount >= 1 && amount <= 10000 ? amount : null;
}

export function renderDecision(
  decision: Decision,
  products: ProductFact[],
  policies: Policies,
  options: { promptForQuantity?: boolean } = {},
): RenderedDecision {
  const selected = decision.productIds.map(id => products.find(p => p.id === id));
  if (decision.intent === "catalog" && decision.catalog) {
    if (decision.catalog.state === "ready" && decision.catalog.title) {
      return { text: catalogAcknowledgement(decision.catalog.title), safe: true, reason: "verified_catalog" };
    }
    return { text: decision.catalog.message || "Indícame la categoría del catálogo que necesitas para prepararlo.", safe: true, reason: "verified_catalog" };
  }
  if (decision.intent === "policy" && decision.policyKey === "pricing") {
    return { text: policies.pricing.trim() || defaultPricingPolicy, safe: true, reason: "verified_policy" };
  }
  if (decision.reason !== "routine" || decision.intent === "handoff") {
    return { text: "Un asesor revisará tu consulta y te atenderá por este mismo chat.", safe: false, reason: decision.reason };
  }
  if (decision.intent === "greeting") return { text: "¡Hola! Soy Super Bot. ¿Qué producto buscas?", safe: true, reason: "greeting" };
  if (decision.intent === "policy" && decision.policyKey === "payment") {
    return {
      text: "Te comparto nuestras cuentas oficiales. Envía tu comprobante; un asesor lo valida antes del despacho.",
      safe: true,
      reason: "verified_payment",
      payment: {
        imageUrl: officialPaymentImagePath,
        alt: "Cuentas oficiales de Original J.J. S.A.C.",
      },
    };
  }
  if (decision.intent === "policy" && decision.policyKey !== "none") {
    const policy = policies[decision.policyKey]?.trim();
    if (policy) return { text: policy, safe: true, reason: "verified_policy" };
  }
  if (["browse", "recommendation"].includes(decision.intent) && selected.length && selected.every((product): product is ProductFact => product != null)) {
    const recommendation = decision.intent === "recommendation";
    const ordered = recommendation
      ? selected.slice().sort((left, right) => left.price - right.price || left.name.localeCompare(right.name, "es") || left.code.localeCompare(right.code, "es"))
      : selected;
    const lines = ordered.map(product => {
      const wholesale = product.wholesalePrice && product.wholesalePrice > 0 && product.wholesaleMinQty > 1
        ? ` · por mayor desde ${product.wholesaleMinQty}: S/ ${product.wholesalePrice.toFixed(2)}`
        : "";
      return `• ${productReference(product)} — S/ ${product.price.toFixed(2)} c/u${wholesale}.`;
    });
    const closing = recommendation
      ? "¿Qué código te interesa? Si es para un equipo específico, indícame cuál para afinar la recomendación."
      : "¿Quieres una o el catálogo PDF?";
    const reply = `${recommendation ? "Opciones verificadas, ordenadas desde la más económica:" : "Opciones verificadas:"}\n${lines.join("\n")}\n${closing}`;
    const recommendations = ordered.map(productPresentation);
    return reply.length > 1000
      ? { text: "Encontré varias opciones verificadas. ¿Deseas que te prepare el catálogo?", safe: true, reason: "verified_catalog", recommendations }
      : { text: reply, safe: true, reason: "verified_catalog", recommendations };
  }
  if (decision.intent === "recommendation") {
    return {
      text: "Para recomendarte una opción adecuada, indícame qué producto o equipo buscas y, si aplica, la medida o el uso.",
      safe: true,
      reason: "recommendation_clarification",
    };
  }
  if (decision.intent === "product" && selected.length && selected.every((product): product is ProductFact => product != null)) {
    const selectedProducts = selected;
    if (
      options.promptForQuantity &&
      decision.priceMode !== "BOX" &&
      decision.quantity === 1 &&
      selectedProducts.length === 1 &&
      selectedProducts[0].stock >= 1 &&
      selectedProducts[0].price > 0
    ) {
      const product = selectedProducts[0];
      return {
        text: `${productReference(product)}: S/ ${product.price.toFixed(2)} c/u.\n¿Cuántas unidades deseas?`,
        safe: true,
        reason: "awaiting_quantity",
        awaitingQuantity: true,
        product: productPresentation(product),
      };
    }
    if (decision.priceMode === "BOX") {
      const validBoxQuote = selectedProducts.every(p => p.boxPrice != null && Number.isFinite(p.boxPrice) && p.boxPrice > 0 && p.unitsPerBox != null && Number.isInteger(p.unitsPerBox) && p.unitsPerBox > 0 && p.stock >= decision.quantity * p.unitsPerBox);
      if (!validBoxQuote) return { text: "La presentación por cajón se confirma con un asesor antes de cotizarla.", safe: false, reason: "needs_clarification" };
      const text = selectedProducts.map(p => {
        const total = Math.round(p.boxPrice! * decision.quantity * 100) / 100;
        return `${productReference(p)}: S/ ${p.boxPrice!.toFixed(2)} por cajón (${p.unitsPerBox} unidades). ${decision.quantity} cajón(es): S/ ${total.toFixed(2)}.`;
      }).join("\n");
      const reply = `${text}\nSujeto a confirmación.`;
      return reply.length > 1000 ? { text: "Un asesor te ayudará a preparar la cotización detallada.", safe: false, reason: "response_limit" } : { text: reply, safe: true, reason: "verified_catalog" };
    }
    if (selectedProducts.every(p => p.stock >= decision.quantity && p.price > 0)) {
      const text = selectedProducts.map(p => {
        const price = p.wholesalePrice && p.wholesalePrice > 0 && decision.quantity >= p.wholesaleMinQty ? p.wholesalePrice : p.price;
        // Inventory is checked on the server to prevent overselling, but its
        // quantity is internal operational data and must never reach a client.
        const total = Math.round(price * decision.quantity * 100) / 100;
        return decision.quantity === 1
          ? `${productReference(p)}: S/ ${price.toFixed(2)} c/u.`
          : `${productReference(p)}: ${decision.quantity} unidades · S/ ${total.toFixed(2)}.`;
      }).join("\n");
      const reply = `${text}\nSujeto a confirmación.`;
      if (reply.length > 1000) return { text: "Un asesor te ayudará a preparar la cotización detallada.", safe: false, reason: "response_limit" };
      return { text: reply, safe: true, reason: "verified_catalog" };
    }
  }
  return { text: "¿Me indicas el nombre o modelo exacto del producto y la cantidad que necesitas? Un asesor puede ayudarte si no lo identificamos.", safe: false, reason: "needs_clarification" };
}
export function automaticAllowed(mode: AiMode, decision: Decision, safe: boolean) {
  if (!safe) return false;
  // Hybrid only handles policy information and unambiguous single-unit quotes.
  return mode === "AUTO" || mode === "HYBRID" && (
    decision.intent === "greeting" || decision.intent === "policy" && decision.policyKey !== "returns" && decision.policyKey !== "payment" ||
    decision.intent === "product" && decision.priceMode !== "BOX" && decision.productIds.length === 1 && decision.quantity === 1
  );
}
export function currentDraft(draft: { contextHash: string; controlRevision: number; settingsRevision: number; expiresAt: Date }, snapshot: Snapshot, revision: number, settingsRevision: number, now = Date.now()) {
  return snapshot.owned && snapshot.canSend && draft.contextHash === snapshot.contextHash &&
    draft.controlRevision === revision && draft.settingsRevision === settingsRevision && draft.expiresAt.getTime() > now;
}
