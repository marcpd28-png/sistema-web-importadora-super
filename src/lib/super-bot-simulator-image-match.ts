import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mapAssistantProduct, type AssistantProductRecord } from "@/lib/shop-assistant";
import type { ShopAssistantProductCard } from "@/lib/shop-assistant-types";
import { createVisualImageHash, rankVisualImageMatches } from "@/lib/product-visual-image-index";

export const SIMULATOR_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = Math.ceil(SIMULATOR_IMAGE_MAX_BYTES / 3) * 4 + 128;
const MIN_MATCH_CONFIDENCE = 0.72;
const MAX_CANDIDATES = 8;
// A re-encoded screenshot of the same ERP artwork commonly differs by seven
// of 64 dHash bits. The next-candidate gap remains mandatory as a guard
// against visually similar products.
const DIRECT_VISUAL_MATCH_MAX_DISTANCE = 7;
const DIRECT_VISUAL_MATCH_MIN_GAP = 3;
const VISUAL_INDEX_CACHE_MS = 30_000;
const IMAGE_MIME_BY_EXTENSION: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const visionSchema = z.object({
  codes: z.array(z.string().trim().min(2).max(64)).max(4),
  searchTerms: z.array(z.string().trim().min(2).max(80)).max(6),
}).strict();

const selectionSchema = z.object({
  productId: z.string().trim().min(1).max(128).nullable(),
  confidence: z.number().min(0).max(1),
}).strict();

type OpenAIResponse = { status?: string; output_text?: string; output?: Array<Record<string, unknown>> };

type Candidate = AssistantProductRecord;
type VisualCandidate = { candidate: Candidate; distance: number };

const candidateSelect = {
  id: true, slug: true, code: true, externalCode: true, externalId: true, name: true,
  description: true, technicalSpecs: true, brand: true, category: true, categoryId: true,
  imageUrl: true, sourceImageUrl: true, localImageUrl: true, unitPrice: true,
  wholesalePrice: true, wholesaleMinQty: true, boxPrice: true, unitsPerBox: true,
  stockUnits: true, isVisible: true,
  media: { orderBy: { sortOrder: "asc" }, take: 2, select: { type: true, url: true, altText: true, sortOrder: true } },
} as const;

let visualIndexCache: { expiresAt: number; rows: Array<{ id: string; imageVisualHash: string | null }> } | null = null;

type Dependencies = {
  apiKey?: string;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  model?: string;
  findCandidates?: (signals: z.infer<typeof visionSchema>) => Promise<Candidate[]>;
  findVisualCandidates?: (visualHash: string) => Promise<VisualCandidate[]>;
  getCurrencySymbol?: () => Promise<string>;
};

export type SimulatorImageMatch = {
  status: "matched" | "unmatched" | "unavailable";
  product?: ShopAssistantProductCard;
  productIsSellable?: boolean;
  confidence?: number;
  reason: "invalid_image" | "not_configured" | "provider_rejected" | "invalid_response" | "low_confidence" | "no_candidates" | null;
};

export function simulatorImageMatchFallbackText(status: SimulatorImageMatch["status"]) {
  return status === "unavailable"
    ? "No pude analizar la imagen ahora. Envía otra foto más clara o cuéntame el tipo, color o tamaño."
    : "No pude identificar el producto con seguridad. Envía otra foto, otra vista o cuéntame el tipo, color o tamaño.";
}

function isJpeg(bytes: Buffer) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Buffer) {
  return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isWebp(bytes: Buffer) {
  return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
}

/** Parses only the image formats accepted by the isolated simulator. */
export function parseSimulatorImageDataUrl(value: string) {
  if (value.length > MAX_DATA_URL_LENGTH) return null;
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match || match[2].length % 4 !== 0) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > SIMULATOR_IMAGE_MAX_BYTES) return null;
  const mimeType = match[1].toLowerCase();
  const valid = (mimeType === "image/jpeg" && isJpeg(bytes))
    || (mimeType === "image/png" && isPng(bytes))
    || (mimeType === "image/webp" && isWebp(bytes));
  return valid ? { dataUrl: value, mimeType, bytes } : null;
}

function outputText(payload: OpenAIResponse) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of payload.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }
  return null;
}

async function responsesJson(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  instructions: string,
  input: unknown,
  schema: object,
  name: string,
) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 260,
      instructions,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as OpenAIResponse;
  if (payload.status !== "completed") return null;
  return outputText(payload);
}

function termsFromSignals(signals: z.infer<typeof visionSchema>) {
  return [...signals.codes, ...signals.searchTerms]
    .map((term) => term.trim())
    .filter((term, index, terms) => term.length >= 2 && terms.indexOf(term) === index)
    .slice(0, 8);
}

async function findCatalogCandidates(signals: z.infer<typeof visionSchema>): Promise<Candidate[]> {
  const terms = termsFromSignals(signals);
  if (!terms.length) return [];
  const products = await prisma.product.findMany({
    where: {
      OR: terms.flatMap((term) => [
        { code: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { brand: { contains: term, mode: "insensitive" } },
        { category: { contains: term, mode: "insensitive" } },
      ]),
    },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
    take: MAX_CANDIDATES,
    select: candidateSelect,
  });
  return products;
}

async function getVisualIndexRows() {
  if (visualIndexCache && visualIndexCache.expiresAt > Date.now()) return visualIndexCache.rows;

  const rows = await prisma.product.findMany({
    where: { imageVisualHash: { not: null } },
    select: { id: true, imageVisualHash: true },
  });
  visualIndexCache = { expiresAt: Date.now() + VISUAL_INDEX_CACHE_MS, rows };
  return rows;
}

async function findVisualCatalogCandidates(visualHash: string): Promise<VisualCandidate[]> {
  const ranked = rankVisualImageMatches(visualHash, await getVisualIndexRows(), MAX_CANDIDATES);
  if (!ranked.length) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ranked.map(({ record }) => record.id) } },
    select: candidateSelect,
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return ranked.flatMap(({ record, distance }) => {
    const candidate = byId.get(record.id);
    return candidate ? [{ candidate, distance }] : [];
  });
}

async function localCandidateImage(url: string | null | undefined) {
  if (!url?.startsWith("/uploads/products/")) return null;
  const relative = url.slice(1);
  const target = path.resolve(process.cwd(), "public", relative);
  const root = path.resolve(process.cwd(), "public", "uploads", "products") + path.sep;
  if (!target.startsWith(root)) return null;
  const mimeType = IMAGE_MIME_BY_EXTENSION[path.extname(target).toLowerCase()];
  if (!mimeType) return null;
  try {
    const bytes = await fs.readFile(target);
    if (!bytes.length || bytes.length > 900_000) return null;
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function candidateVisualInputs(candidates: Candidate[]) {
  const visuals = await Promise.all(candidates.slice(0, 4).map(async (candidate) => {
    const local = candidate.localImageUrl
      ?? candidate.media?.find((media) => media.type === "IMAGE")?.url
      ?? candidate.imageUrl
      ?? null;
    const imageUrl = await localCandidateImage(local);
    return imageUrl
      ? [
          { type: "input_text", text: `Referencia visual del candidato: productId=${candidate.id}; código=${candidate.code}; nombre=${candidate.name}` },
          { type: "input_image", image_url: imageUrl, detail: "low" },
        ]
      : [];
  }));
  return visuals.flat();
}

const visionJsonSchema = {
  type: "object", additionalProperties: false, required: ["codes", "searchTerms"],
  properties: {
    codes: { type: "array", maxItems: 4, items: { type: "string", minLength: 2, maxLength: 64 } },
    searchTerms: { type: "array", maxItems: 6, items: { type: "string", minLength: 2, maxLength: 80 } },
  },
} as const;

const selectionJsonSchema = {
  type: "object", additionalProperties: false, required: ["productId", "confidence"],
  properties: { productId: { type: ["string", "null"], minLength: 1, maxLength: 128 }, confidence: { type: "number", minimum: 0, maximum: 1 } },
} as const;

function mergeCandidates(visualCandidates: VisualCandidate[], textCandidates: Candidate[]) {
  const unique = new Map<string, Candidate>();
  for (const { candidate } of visualCandidates) unique.set(candidate.id, candidate);
  for (const candidate of textCandidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  return [...unique.values()].slice(0, MAX_CANDIDATES);
}

function hasClearVisualMatch(candidates: VisualCandidate[]) {
  const first = candidates[0];
  const second = candidates[1];
  return Boolean(
    first
    && first.distance <= DIRECT_VISUAL_MATCH_MAX_DISTANCE
    && (!second || second.distance - first.distance >= DIRECT_VISUAL_MATCH_MIN_GAP),
  );
}

function isSellableCandidate(candidate: Candidate) {
  return candidate.isVisible !== false && candidate.stockUnits > 0 && Number(candidate.unitPrice) > 0;
}

/**
 * Matches an uploaded screenshot only inside the admin simulator. The model
 * can select an ID from a bounded, local-catalog candidate list; its answer
 * is never accepted as a product record without that local validation.
 */
export async function matchSimulatorProductImage(imageDataUrl: string, dependencies: Dependencies = {}): Promise<SimulatorImageMatch> {
  const parsed = parseSimulatorImageDataUrl(imageDataUrl);
  if (!parsed) return { status: "unmatched", reason: "invalid_image" };

  try {
    let visualCandidates: VisualCandidate[] = [];
    try {
      const visualHash = await createVisualImageHash(parsed.bytes);
      visualCandidates = await (dependencies.findVisualCandidates ?? findVisualCatalogCandidates)(visualHash);
    } catch {
      // Vision still provides a fallback when a malformed or uncommon image
      // cannot produce a local perceptual hash.
    }

    if (hasClearVisualMatch(visualCandidates)) {
      const match = visualCandidates[0]!;
      const currency = await (dependencies.getCurrencySymbol ?? (async () => (await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { currencySymbol: true } }))?.currencySymbol ?? "S/"))();
      return {
        status: "matched",
        product: mapAssistantProduct(match.candidate, currency),
        productIsSellable: isSellableCandidate(match.candidate),
        confidence: Number((1 - match.distance / 64).toFixed(2)),
        reason: null,
      };
    }

    const apiKey = dependencies.apiKey ?? process.env.OPENAI_API_KEY?.trim();
    if (!dependencies.enabled || !apiKey) return { status: "unavailable", reason: "not_configured" };
    const fetchImpl = dependencies.fetchImpl ?? fetch;
    const model = dependencies.model ?? (process.env.SUPER_BOT_MODEL?.trim() || "gpt-6.1-sol");
    const visionText = await responsesJson(
      fetchImpl, apiKey, model,
      "Analiza la captura de un anuncio o tienda. Extrae solamente códigos de producto visibles y términos concretos de marca, modelo o nombre. No inventes códigos. Devuelve únicamente el JSON solicitado.",
      [{ role: "user", content: [{ type: "input_text", text: "Busca señales para identificar un producto del catálogo." }, { type: "input_image", image_url: parsed.dataUrl, detail: "low" }] }],
      visionJsonSchema, "super_bot_simulator_image_signals",
    );
    if (!visionText) return { status: "unavailable", reason: "provider_rejected" };
    let signals: z.infer<typeof visionSchema> | null = null;
    try {
      const parsedSignals = visionSchema.safeParse(JSON.parse(visionText));
      if (parsedSignals.success) signals = parsedSignals.data;
    } catch {
      // The visual candidates remain useful even if the provider's OCR JSON
      // is malformed, so continue to the grounded selection stage.
    }
    const textCandidates = signals
      ? await (dependencies.findCandidates ?? findCatalogCandidates)(signals)
      : [];
    const candidates = mergeCandidates(visualCandidates, textCandidates);
    if (!candidates.length) return { status: "unmatched", reason: "no_candidates" };

    const selectionText = await responsesJson(
      fetchImpl, apiKey, model,
      "Compara la captura con los candidatos del catálogo local. Selecciona un productId solo si la coincidencia es clara por código, modelo, nombre o imagen. Si hay duda, usa null y confianza baja. No inventes datos. Devuelve únicamente el JSON solicitado.",
      [{ role: "user", content: [
        { type: "input_text", text: JSON.stringify({ candidates: candidates.map((candidate) => ({ id: candidate.id, code: candidate.code, name: candidate.name, brand: candidate.brand, category: candidate.category })) }) },
        { type: "input_image", image_url: parsed.dataUrl, detail: "low" },
        ...await candidateVisualInputs(candidates),
      ] }],
      selectionJsonSchema, "super_bot_simulator_image_selection",
    );
    if (!selectionText) return { status: "unavailable", reason: "provider_rejected" };
    const selection = (() => {
      try {
        return selectionSchema.safeParse(JSON.parse(selectionText));
      } catch {
        return null;
      }
    })();
    if (!selection?.success) return { status: "unmatched", reason: "invalid_response" };
    const product = candidates.find((candidate) => candidate.id === selection.data.productId);
    if (!product || selection.data.confidence < MIN_MATCH_CONFIDENCE) return { status: "unmatched", reason: "low_confidence" };
    const currency = await (dependencies.getCurrencySymbol ?? (async () => (await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { currencySymbol: true } }))?.currencySymbol ?? "S/"))();
    return {
      status: "matched",
      product: mapAssistantProduct(product, currency),
      productIsSellable: isSellableCandidate(product),
      confidence: selection.data.confidence,
      reason: null,
    };
  } catch {
    return { status: "unavailable", reason: "provider_rejected" };
  }
}
