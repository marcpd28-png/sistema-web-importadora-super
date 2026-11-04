import { findAllCatalogProductIds, productQueryTerms } from "./catalog-query";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import PDFDocument from "pdfkit";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { buildPublicUrl } from "@/lib/site-url";
import { getCatalogRequestScope } from "@/lib/catalog-intent";

const CATALOG_DIRECTORY = path.join(process.cwd(), "public", "uploads", "catalogs");
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 12_000;
const BRAND_PRIMARY = "#2320DA";
/** Leave headroom below Telegram's 20 MB URL-download ceiling so the same
 * PDF part can be delivered through every supported document channel. */
export const MAX_CATALOG_PDF_BYTES = 18 * 1024 * 1024;

export type CatalogProductImage = {
  id: string;
  name: string;
  code: string;
  imageUrls: string[];
  updatedAt: Date;
  unitPrice: unknown;
  wholesalePrice: unknown;
  wholesaleMinQty: number;
};

export type GeneratedCatalogPdf = {
  absoluteUrl: string;
  filename: string;
  generated: boolean;
  productCount: number;
  relativeUrl: string;
  sizeBytes: number;
};

/** Ordered documents for a complete requested collection. The caller must
 * deliver every entry in order; `documents` is never a best-effort subset. */
export type GeneratedCatalogPdfBundle = {
  documents: GeneratedCatalogPdf[];
  productCount: number;
};

const inFlightCatalogBundles = new Map<string, Promise<GeneratedCatalogPdfBundle>>();

export class CatalogPdfSizeLimitError extends Error {
  constructor() {
    super("El catálogo excede el tamaño máximo para enviarlo como un solo PDF.");
    this.name = "CatalogPdfSizeLimitError";
  }
}

/** Raised instead of making a partial catalogue when a matching product has
 * no usable, real product photo. The caller can then link the web catalogue or
 * involve an adviser without claiming that the PDF is complete. */
export class CatalogPdfImageCoverageError extends Error {
  readonly productCodes: string[];

  constructor(products: Array<Pick<CatalogProductImage, "code">>) {
    const productCodes = products.map((product) => product.code);
    super(`No se pudo cargar una foto real para: ${productCodes.join(", ")}.`);
    this.name = "CatalogPdfImageCoverageError";
    this.productCodes = productCodes;
  }
}

/** A stock/visibility change during generation must invalidate the request;
 * emitting only the surviving rows would otherwise silently truncate it. */
export class CatalogPdfProductCoverageError extends Error {
  readonly productIds: string[];

  constructor(productIds: string[]) {
    super("Los productos del catálogo cambiaron mientras se preparaba el PDF.");
    this.name = "CatalogPdfProductCoverageError";
    this.productIds = productIds;
  }
}

export function isProjectorCatalogRequest(content: string) {
  return parseCatalogRequest(content)?.terms.some((term) => /^proyector(?:es)?$/.test(term)) ?? false;
}

export type CatalogRequest = {
  slug: string;
  title: string;
  terms: string[];
};

function catalogScope(content: string): string | null {
  const scope = getCatalogRequestScope(content);
  if (scope === null) return null;
  return scope
    .split(/\s+/)
    .filter((word) => !["escoger", "escogerm", "elegir", "todo", "todos", "completa"].includes(word))
    .join(" ");
}
export function isGeneralCatalogRequest(content: string) {
  const scope = catalogScope(content);
  return scope !== null && productQueryTerms(scope).length === 0;
}
export function parseCatalogRequest(content: string): CatalogRequest | null {
  const scope = catalogScope(content);
  if (scope === null) return null;
  const terms = productQueryTerms(scope);
  if (!terms.length) return null;
  return { terms, slug: terms.join("-").slice(0, 80), title: "CATÁLOGO DE " + terms.join(" ").toUpperCase() };
}

type ProductWithCatalogImageFields = {
  id: string;
  name: string;
  code: string;
  imageUrl: string | null;
  localImageUrl: string | null;
  media: Array<{ url: string }>;
  sourceImageUrl: string | null;
  updatedAt: Date;
  unitPrice: unknown;
  wholesalePrice: unknown;
  wholesaleMinQty: number;
};

function toCatalogProductImage(product: ProductWithCatalogImageFields): CatalogProductImage {
  const imageUrls = Array.from(
    new Set(
      [
        product.localImageUrl,
        ...product.media.map((media) => media.url),
        product.sourceImageUrl,
        product.imageUrl,
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  );

  return { ...product, imageUrls };
}

async function findProjectorImages(): Promise<CatalogProductImage[]> {
  const products = await prisma.product.findMany({
    where: {
      isVisible: true,
      stockUnits: { gt: 0 },
      OR: [
        { name: { contains: "proyector", mode: "insensitive" } },
        { category: { contains: "proyector", mode: "insensitive" } },
        { description: { contains: "proyector", mode: "insensitive" } },
      ],
    },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      imageUrl: true,
      localImageUrl: true,
      media: {
        orderBy: { sortOrder: "asc" },
        select: { url: true },
      },
      sourceImageUrl: true,
      updatedAt: true,
      unitPrice: true, wholesalePrice: true, wholesaleMinQty: true,
    },
  });

  // Keep rows with no stored photo. Strict preflight below will fail the
  // complete request rather than quietly removing them from the PDF.
  return products.map(toCatalogProductImage);
}

async function findCatalogImages(terms: string[]): Promise<CatalogProductImage[]> {
  // Chat result lists have a display limit. A PDF request is a completeness
  // contract, so it deliberately loads every currently eligible match.
  const ids = await findAllCatalogProductIds(terms.join(" "));
  if (!ids.length) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isVisible: true, stockUnits: { gt: 0 }, unitPrice: { gt: 0 } },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, code: true, imageUrl: true, localImageUrl: true,
      media: { orderBy: { sortOrder: "asc" }, select: { url: true } },
      sourceImageUrl: true, updatedAt: true,
      unitPrice: true, wholesalePrice: true, wholesaleMinQty: true,
    },
  });

  const byId = new Map(products.map((product) => [product.id, toCatalogProductImage(product)]));
  const missingProductIds = ids.filter((id) => !byId.has(id));
  if (missingProductIds.length) throw new CatalogPdfProductCoverageError(missingProductIds);

  // Reapply the identity-search order. The manifest later checks this exact
  // sequence, which prevents duplicated or omitted pages between parts.
  return ids.map((id) => byId.get(id)!);
}

function getCatalogFingerprint(products: CatalogProductImage[]) {
  return createHash("sha256")
    .update("large-product-page-v4-current-prices")
    .update(
      JSON.stringify(
        products.map((product) => [
          product.id,
          product.name,
          product.code,
          product.imageUrls,
          product.updatedAt.toISOString(),
          product.unitPrice,
          product.wholesalePrice,
          product.wholesaleMinQty,
        ]),
      ),
    )
    .digest("hex")
    .slice(0, 16);
}

function resolveLocalImagePath(imageUrl: string) {
  if (!imageUrl.startsWith("/uploads/")) {
    return null;
  }

  const relativePath = imageUrl.slice("/uploads/".length);
  const resolvedPath = path.resolve(process.cwd(), "public", "uploads", relativePath);
  const uploadRoot = path.resolve(process.cwd(), "public", "uploads");

  return resolvedPath.startsWith(`${uploadRoot}${path.sep}`) ? resolvedPath : null;
}

export async function loadCatalogImage(imageUrl: string) {
  const localPath = resolveLocalImagePath(imageUrl);
  let source: Buffer;

  if (localPath) {
    source = await readFile(localPath);
  } else {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    try {
      const response = await fetch(imageUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Image request failed with HTTP ${response.status}`);
      }

      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
        throw new Error("Remote image is too large");
      }

      source = Buffer.from(await response.arrayBuffer());
      if (source.byteLength > MAX_REMOTE_IMAGE_BYTES) {
        throw new Error("Remote image is too large");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return prepareCatalogImage(source);
}

export async function prepareCatalogImage(source: Buffer) {
  // Flatten transparency and remove only near-white padding, preserving artwork.
  const flattened = await sharp(source).rotate().flatten({ background: "#FFFFFF" }).png().toBuffer();
  let cropped = flattened;
  try {
    cropped = await sharp(flattened).trim({ background: "#FFFFFF", threshold: 8 }).toBuffer();
  } catch {
    // Uniform images cannot always be trimmed.
  }
  return sharp(cropped)
    .resize({
      width: 1800,
      height: 2200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#FFFFFF" })
    .withIccProfile("srgb")
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function loadFirstAvailableImage(product: CatalogProductImage) {
  for (const imageUrl of product.imageUrls) {
    try {
      return await loadCatalogImage(imageUrl);
    } catch {
      // Try the next stored source for this product.
    }
  }

  throw new Error(`No available image for product ${product.id}`);
}

export type LoadedCatalogProductImage = CatalogProductImage & { image: Buffer };

/**
 * Load a real photo for every selected product before rendering any page. A
 * fallback source on the same product is fine, but dropping a failed product
 * is not: callers either receive complete coverage or an explicit error.
 */
export async function loadCatalogImagesStrict(
  products: CatalogProductImage[],
  imageLoader: (product: CatalogProductImage) => Promise<Buffer> = loadFirstAvailableImage,
): Promise<LoadedCatalogProductImage[]> {
  const loaded: Array<LoadedCatalogProductImage | undefined> = new Array(products.length);
  const missing: CatalogProductImage[] = [];

  // Keep decoding bounded while retaining the source order exactly.
  for (let index = 0; index < products.length; index += 4) {
    const batch = products.slice(index, index + 4);
    const results = await Promise.allSettled(batch.map(imageLoader));

    results.forEach((result, batchIndex) => {
      const product = batch[batchIndex];
      if (result.status === "fulfilled") {
        loaded[index + batchIndex] = { ...product, image: result.value };
      } else {
        missing.push(product);
      }
    });
  }

  if (missing.length) throw new CatalogPdfImageCoverageError(missing);
  return loaded as LoadedCatalogProductImage[];
}

export type RenderedCatalogPdfPart<T> = {
  items: T[];
  pdf: Buffer;
};

/**
 * Render-and-split recursively instead of guessing based on number of pages.
 * Image compression varies significantly, so byte size is the only reliable
 * Telegram-safe boundary. The returned parts retain the original item order.
 */
export async function splitCatalogItemsByRenderedSize<T>(
  items: T[],
  render: (items: T[]) => Promise<Buffer>,
  maxBytes = MAX_CATALOG_PDF_BYTES,
): Promise<Array<RenderedCatalogPdfPart<T>>> {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new RangeError("maxBytes must be positive");
  if (!items.length) return [];

  const pdf = await render(items);
  if (pdf.byteLength <= maxBytes) return [{ items, pdf }];
  if (items.length === 1) throw new CatalogPdfSizeLimitError();

  const midpoint = Math.ceil(items.length / 2);
  // Rendering can hold several full-page image buffers in memory. Split
  // sequentially so an unusually large category cannot fan out into dozens
  // of simultaneous PDFKit jobs.
  const first = await splitCatalogItemsByRenderedSize(items.slice(0, midpoint), render, maxBytes);
  const second = await splitCatalogItemsByRenderedSize(items.slice(midpoint), render, maxBytes);
  return [...first, ...second];
}

export function renderCatalogImagePdf(images: { image: Buffer; name: string; code: string; unitPrice?: unknown; wholesalePrice?: unknown; wholesaleMinQty?: number }[], title = "CATÁLOGO DE PRODUCTOS") {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      compress: true,
      info: {
        Author: "Importaciones Super",
        Creator: "Tienda Virtual Importaciones Super",
        Subject: "Catálogo visual de productos",
        Title: title,
      },
      margin: 0,
      size: "A4",
    });
    const chunks: Buffer[] = [];

    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const marginX = 36;
    const headerHeight = 82;
    const imageWidth = pageWidth - marginX * 2;

    images.forEach((product, index) => {
      document.addPage({ margin: 0, size: "A4" });
      document
        .fillColor(BRAND_PRIMARY)
        .font("Helvetica-Bold")
        .fontSize(23)
        .text(title, marginX, 30, {
          align: "center",
          width: imageWidth,
        });
      document.moveTo(marginX, 66).lineTo(pageWidth - marginX, 66)
        .lineWidth(2).strokeColor(BRAND_PRIMARY).stroke();
      document.fillColor("#555555").font("Helvetica").fontSize(8).text("Imagen referencial. Consulta los precios vigentes al pie de esta página.", marginX, 71, { width: imageWidth, align: "center" });
      document.image(product.image, marginX, headerHeight, {
        align: "center",
        fit: [imageWidth, 555],
        valign: "center",
      });
      document.fillColor("#17172B").font("Helvetica-Bold").fontSize(17);
      let nameSize = 17;
      while (document.heightOfString(product.name, { width: imageWidth }) > 56 && nameSize > 11) {
        document.fontSize(--nameSize);
      }
      document.text(product.name, marginX, 653, { width: imageWidth, align: "center" });
      document.fillColor(BRAND_PRIMARY).font("Helvetica-Bold").fontSize(15)
        .text(`Código: ${product.code}`, marginX, 715, { width: imageWidth, align: "center" });
      if (Number(product.unitPrice) > 0) {
        document.fillColor("#17172B").font("Helvetica-Bold").fontSize(14).text(`Precio vigente: S/ ${Number(product.unitPrice).toFixed(2)}`, marginX, 744, { width: imageWidth, align: "center" });
        if (Number(product.wholesalePrice) > 0) document.font("Helvetica").fontSize(12).text(`Mayorista desde ${product.wholesaleMinQty} unidades: S/ ${Number(product.wholesalePrice).toFixed(2)}`, marginX, 766, { width: imageWidth, align: "center" });
      }
      document.fillColor("#666666").font("Helvetica").fontSize(9)
        .text(`${index + 1} / ${images.length}`, marginX, pageHeight - 28, { width: imageWidth, align: "center" });
    });

    document.end();
  });
}

type CatalogBundleManifestPart = {
  filename: string;
  productCount: number;
  productIds: string[];
  sizeBytes: number;
};

type CatalogBundleManifest = {
  version: 1;
  productIds: string[];
  parts: CatalogBundleManifestPart[];
};

function hasExactOrder(actual: string[], expected: string[]) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function catalogBundleBaseFilename(slug: string, fingerprint: string) {
  return `catalogo-${slug}-${fingerprint}`;
}

function catalogPartFilename(baseFilename: string, index: number, total: number) {
  if (total === 1) return `${baseFilename}.pdf`;
  const width = String(total).length;
  return `${baseFilename}-parte-${String(index + 1).padStart(width, "0")}-de-${total}.pdf`;
}

function catalogDocument(filename: string, productCount: number, sizeBytes: number, generated: boolean): GeneratedCatalogPdf {
  const relativeUrl = `/uploads/catalogs/${filename}`;
  return {
    absoluteUrl: buildPublicUrl(relativeUrl),
    filename,
    generated,
    productCount,
    relativeUrl,
    sizeBytes,
  };
}

function isCatalogBundleManifest(value: unknown): value is CatalogBundleManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<CatalogBundleManifest>;
  return manifest.version === 1 && Array.isArray(manifest.productIds) && Array.isArray(manifest.parts);
}

async function readCachedCatalogBundle(
  products: CatalogProductImage[],
  slug: string,
  fingerprint: string,
): Promise<GeneratedCatalogPdfBundle | null> {
  const baseFilename = catalogBundleBaseFilename(slug, fingerprint);
  const manifestPath = path.join(CATALOG_DIRECTORY, `${baseFilename}.json`);
  const productIds = products.map((product) => product.id);

  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    if (!isCatalogBundleManifest(parsed) || !hasExactOrder(parsed.productIds, productIds) || !parsed.parts.length) return null;

    const cachedProductIds: string[] = [];
    const documents: GeneratedCatalogPdf[] = [];
    for (let index = 0; index < parsed.parts.length; index += 1) {
      const part = parsed.parts[index];
      const expectedFilename = catalogPartFilename(baseFilename, index, parsed.parts.length);
      if (
        part.filename !== expectedFilename ||
        !Array.isArray(part.productIds) ||
        !Number.isInteger(part.productCount) ||
        part.productCount !== part.productIds.length ||
        !Number.isInteger(part.sizeBytes) ||
        part.sizeBytes < 1
      ) return null;

      const outputPath = path.resolve(CATALOG_DIRECTORY, part.filename);
      if (path.dirname(outputPath) !== path.resolve(CATALOG_DIRECTORY)) return null;
      const fileStats = await stat(outputPath);
      if (!fileStats.isFile() || fileStats.size !== part.sizeBytes || fileStats.size > MAX_CATALOG_PDF_BYTES) return null;

      cachedProductIds.push(...part.productIds);
      documents.push(catalogDocument(part.filename, part.productCount, fileStats.size, false));
    }

    if (!hasExactOrder(cachedProductIds, productIds)) return null;
    return { documents, productCount: productIds.length };
  } catch {
    return null;
  }
}

async function writeAtomically(outputPath: string, contents: Buffer | string) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { flag: "wx" });
    // Part files are deterministic. A process can die after writing one part
    // but before it publishes the manifest; the next generation replaces that
    // orphan atomically. The manifest is the only cache entry readers trust.
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function createCatalogPdfBundle(
  products: CatalogProductImage[],
  slug: string,
  title: string,
  fingerprint: string,
): Promise<GeneratedCatalogPdfBundle> {
  await mkdir(CATALOG_DIRECTORY, { recursive: true });

  const cached = await readCachedCatalogBundle(products, slug, fingerprint);
  if (cached) return cached;

  const images = await loadCatalogImagesStrict(products);
  const renderedParts = await splitCatalogItemsByRenderedSize(
    images,
    (part) => renderCatalogImagePdf(part, title),
  );
  if (!renderedParts.length) throw new CatalogPdfProductCoverageError(products.map((product) => product.id));

  const productIds = products.map((product) => product.id);
  const renderedProductIds = renderedParts.flatMap((part) => part.items.map((product) => product.id));
  if (!hasExactOrder(renderedProductIds, productIds)) {
    throw new CatalogPdfProductCoverageError(productIds);
  }

  const baseFilename = catalogBundleBaseFilename(slug, fingerprint);
  const documents: GeneratedCatalogPdf[] = [];
  const manifestParts: CatalogBundleManifestPart[] = [];

  for (let index = 0; index < renderedParts.length; index += 1) {
    const part = renderedParts[index];
    const filename = catalogPartFilename(baseFilename, index, renderedParts.length);
    await writeAtomically(path.join(CATALOG_DIRECTORY, filename), part.pdf);
    documents.push(catalogDocument(filename, part.items.length, part.pdf.byteLength, true));
    manifestParts.push({
      filename,
      productCount: part.items.length,
      productIds: part.items.map((product) => product.id),
      sizeBytes: part.pdf.byteLength,
    });
  }

  const manifest: CatalogBundleManifest = { version: 1, productIds, parts: manifestParts };
  await writeAtomically(path.join(CATALOG_DIRECTORY, `${baseFilename}.json`), JSON.stringify(manifest));
  return { documents, productCount: productIds.length };
}

async function generateCatalogPdfBundleForProducts(
  products: CatalogProductImage[],
  slug: string,
  title: string,
): Promise<GeneratedCatalogPdfBundle> {
  const fingerprint = createHash("sha256")
    .update(slug)
    .update(getCatalogFingerprint(products))
    .digest("hex")
    .slice(0, 16);
  const cacheKey = `${slug}-${fingerprint}`;
  const existing = inFlightCatalogBundles.get(cacheKey);
  if (existing) return existing;

  const generation = createCatalogPdfBundle(products, slug, title, fingerprint).finally(() => {
    inFlightCatalogBundles.delete(cacheKey);
  });
  inFlightCatalogBundles.set(cacheKey, generation);
  return generation;
}

export async function generateProjectorCatalogPdf() {
  const products = await findProjectorImages();
  if (!products.length) throw new Error("No hay proyectores publicados para el catálogo.");

  const bundle = await generateCatalogPdfBundleForProducts(products, "proyectores", "CATÁLOGO DE PROYECTORES");
  if (bundle.documents.length !== 1) throw new CatalogPdfSizeLimitError();
  return bundle.documents[0];
}

/** Generate every matching, saleable product as one or more ordered PDFs.
 * Each document is independently Telegram-safe and the union is manifest-
 * checked to contain every selected product exactly once. */
export async function generateCatalogPdfBundle(request: CatalogRequest) {
  const products = await findCatalogImages(request.terms);
  if (!products.length) {
    throw new Error(`No encontramos productos publicados para el catálogo de ${request.terms.join(" ")}.`);
  }
  return generateCatalogPdfBundleForProducts(products, request.slug, request.title);
}

/** Legacy callers that can only deliver one attachment retain their existing
 * contract. They fail explicitly rather than quietly returning the first part
 * of a multi-document catalogue. */
export async function generateCatalogPdf(request: CatalogRequest) {
  const bundle = await generateCatalogPdfBundle(request);
  if (bundle.documents.length !== 1) throw new CatalogPdfSizeLimitError();
  return bundle.documents[0];
}

// Compatibility surface for internal catalog consumers. These helpers retain
// the structured result expected by the existing assistant flows.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function generateRequestedCatalogPdf(
  content: string,
  _includeScreenExtenders = false,
  _catalogSnapshot?: unknown,
  // These are intentionally permissive because the legacy assistant owns the
  // richer product snapshot type in a separately deployed release.
  selection?: any,
) {
  const request = parseCatalogRequest(content);
  const catalog = request ? await generateCatalogPdf(request) : null;
  return {
    catalog,
    products: (selection?.products ?? []) as any[],
    label: selection?.label ?? request?.terms.join(" ") ?? "productos",
    scopes: selection?.scopes ?? [],
    brands: selection?.brands ?? [],
    categories: selection?.categories ?? [],
    types: selection?.types ?? [],
    terms: selection?.terms ?? request?.terms ?? [],
    scoped: selection?.scoped ?? Boolean(request),
    unmatchedScopes: selection?.unmatchedScopes ?? [],
  };
}

export async function generateRequestedProductImages(
  _content: string,
  selection?: any,
) {
  return {
    products: (selection?.products ?? []) as any[],
    outboundMessages: [] as { type: "IMAGE"; content: string; mediaUrl: string }[],
    scopes: [],
    brands: selection?.brands ?? [],
    categories: selection?.categories ?? [],
    types: selection?.types ?? [],
    terms: selection?.terms ?? [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
