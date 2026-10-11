import { findCatalogProductIds, productQueryTerms } from "./rocky-product-query";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import PDFDocument from "pdfkit";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { buildPublicUrl } from "@/lib/site-url";

const CATALOG_DIRECTORY = path.join(process.cwd(), "public", "uploads", "catalogs");
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 12_000;
const BRAND_PRIMARY = "#2320DA";
const LEGACY_QUERY_LIMIT = 80;
export const CATALOG_PRODUCTS_PER_PART = 32;

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

export type CatalogSnapshotProduct = CatalogProductImage & {
  category?: string | null;
  brand?: string | null;
};

export type CatalogPdfPart = {
  absoluteUrl: string;
  filename: string;
  relativeUrl: string;
  partNumber: number;
  partCount: number;
  productCount: number;
  missingImageCount: number;
};

export type GeneratedCatalogPdf = {
  absoluteUrl: string;
  filename: string;
  generated: boolean;
  productCount: number;
  relativeUrl: string;
};

const inFlightCatalogs = new Map<string, Promise<GeneratedCatalogPdf>>();

export function isProjectorCatalogRequest(content: string) {
  const normalized = content
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return /\bcatalogo\b/.test(normalized) && /\bproyector(?:es)?\b/.test(normalized);
}

export type CatalogRequest = {
  slug: string;
  title: string;
  terms: string[];
};

// Explicit catalogue vocabulary: a broad edit-distance match used to classify
// ordinary product words as catalogues (and route them to a failed PDF).
const CATALOG_WORDS = new Set(["catalogo", "catalogos", "catalog", "catalogue", "catalgo", "catalgoo", "cataglafo"]);
function catalogScope(content: string): string | null {
  const words = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
  const index = words.findIndex(word => CATALOG_WORDS.has(word));
  if (index < 0) return null;
  return words.slice(index + 1).filter(word => !["escoger", "escogerm", "elegir", "todo", "todos", "completa"].includes(word)).join(" ");
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

  return products.flatMap((product) => {
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

    return imageUrls.length ? [{ ...product, imageUrls }] : [];
  });
}

async function findCatalogImages(terms: string[]): Promise<CatalogProductImage[]> {
  const ids = await findCatalogProductIds(terms.join(" "), LEGACY_QUERY_LIMIT);
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

  return products.flatMap((product) => {
    const imageUrls = Array.from(new Set([
      product.localImageUrl, ...product.media.map((media) => media.url), product.sourceImageUrl, product.imageUrl,
    ].filter((value): value is string => Boolean(value?.trim()))));
    return imageUrls.length ? [{ ...product, imageUrls }] : [];
  });
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
      let titleSize = 23;
      document.font("Helvetica-Bold").fontSize(titleSize);
      while (document.heightOfString(title, { width: imageWidth }) > 28 && titleSize > 13) {
        document.fontSize(--titleSize);
      }
      document
        .fillColor(BRAND_PRIMARY)
        .text(title, marginX, 30, {
          align: "center",
          width: imageWidth,
        });
      document.moveTo(marginX, 66).lineTo(pageWidth - marginX, 66)
        .lineWidth(2).strokeColor(BRAND_PRIMARY).stroke();
      document.fillColor("#555555").font("Helvetica").fontSize(8).text("Imagen referencial. Las fichas sin foto se señalan explícitamente. Consulta los precios vigentes.", marginX, 71, { width: imageWidth, align: "center" });
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

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function createCatalogPhotoUnavailablePlaceholder(product: Pick<CatalogSnapshotProduct, "name" | "code">) {
  const source = Buffer.from(`
    <svg width="1200" height="900" viewBox="0 0 1200 900" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="900" fill="#f2f3f8"/>
      <rect x="48" y="48" width="1104" height="804" rx="28" fill="#ffffff" stroke="#2320DA" stroke-width="8"/>
      <path d="M485 305h230a36 36 0 0 1 36 36v188a36 36 0 0 1-36 36H485a36 36 0 0 1-36-36V341a36 36 0 0 1 36-36Z" fill="#e4e6f7" stroke="#2320DA" stroke-width="12"/>
      <circle cx="555" cy="405" r="35" fill="#2320DA"/>
      <path d="m475 535 83-83 55 55 42-42 70 70" fill="none" stroke="#2320DA" stroke-width="15" stroke-linejoin="round"/>
      <text x="600" y="650" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#17172B">FOTO NO DISPONIBLE</text>
      <text x="600" y="715" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#555555">${xml(product.code)}</text>
      <text x="600" y="765" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" fill="#555555">Se conserva el producto en el catálogo.</text>
    </svg>`);
  return sharp(source).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

async function loadSnapshotProductImage(product: CatalogSnapshotProduct) {
  try {
    return { image: await loadFirstAvailableImage(product), missing: false };
  } catch {
    return { image: await createCatalogPhotoUnavailablePlaceholder(product), missing: true };
  }
}

function partFilename(scopeKey: string, snapshotHash: string, partNumber: number, partCount: number) {
  const slug = scopeKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "general";
  return `catalogo-${slug}-${snapshotHash}-parte-${partNumber}-de-${partCount}.pdf`;
}

function validPartManifest(value: unknown, expected: { partNumber: number; partCount: number; productCount: number }) {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Record<string, unknown>;
  return manifest.version === 1 && manifest.partNumber === expected.partNumber && manifest.partCount === expected.partCount &&
    manifest.productCount === expected.productCount && Number.isInteger(manifest.missingImageCount) && Number(manifest.missingImageCount) >= 0;
}

async function createCatalogPdfPart(
  products: CatalogSnapshotProduct[],
  input: { scopeKey: string; title: string; snapshotHash: string; partNumber: number; partCount: number },
): Promise<CatalogPdfPart> {
  const filename = partFilename(input.scopeKey, input.snapshotHash, input.partNumber, input.partCount);
  const relativeUrl = `/uploads/catalogs/${filename}`;
  const outputPath = path.join(CATALOG_DIRECTORY, filename);
  const expected = { partNumber: input.partNumber, partCount: input.partCount, productCount: products.length };
  await mkdir(CATALOG_DIRECTORY, { recursive: true });

  try {
    await access(outputPath);
    const manifest = JSON.parse(await readFile(`${outputPath}.json`, "utf8"));
    if (!validPartManifest(manifest, expected)) throw new Error("Invalid catalog part manifest");
    return {
      absoluteUrl: buildPublicUrl(relativeUrl), filename, relativeUrl, ...expected,
      missingImageCount: Number((manifest as Record<string, unknown>).missingImageCount),
    };
  } catch {
    // The exact immutable part is generated below. A partial PDF is never reused.
  }

  const rendered: Array<CatalogSnapshotProduct & { image: Buffer }> = [];
  let missingImageCount = 0;
  for (let index = 0; index < products.length; index += 4) {
    const batch = await Promise.all(products.slice(index, index + 4).map(async product => ({ product, ...(await loadSnapshotProductImage(product)) })));
    for (const item of batch) {
      if (item.missing) missingImageCount++;
      rendered.push({ ...item.product, image: item.image });
    }
  }
  const title = input.partCount > 1 ? `${input.title} · PARTE ${input.partNumber}/${input.partCount}` : input.title;
  const pdf = await renderCatalogImagePdf(rendered, title);
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  const manifest = { version: 1, ...expected, missingImageCount };
  try {
    await writeFile(temporaryPath, pdf, { flag: "wx" });
    await rename(temporaryPath, outputPath);
    await writeFile(`${outputPath}.json`, JSON.stringify(manifest), { flag: "w" });
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    // A second worker can finish the same immutable part between our access
    // check and rename. Its valid manifest is safe to reuse on the next retry.
    throw error;
  }
  return { absoluteUrl: buildPublicUrl(relativeUrl), filename, relativeUrl, ...expected, missingImageCount };
}

export function catalogParts<T>(products: readonly T[], perPart = CATALOG_PRODUCTS_PER_PART): T[][] {
  if (!Number.isInteger(perPart) || perPart < 1) throw new Error("Invalid catalog part size");
  const result: T[][] = [];
  for (let index = 0; index < products.length; index += perPart) result.push([...products.slice(index, index + perPart)]);
  return result;
}

/** Render from a previously persisted snapshot only. This intentionally never
 * queries ERP data, so retries and all parts use the same names, SKUs and prices. */
export async function generateCatalogSnapshotPdfs(input: { scopeKey: string; title: string; snapshotHash: string; products: CatalogSnapshotProduct[] }) {
  if (!input.products.length) throw new Error("A catalog snapshot must contain at least one product.");
  const parts = catalogParts(input.products);
  const generated: CatalogPdfPart[] = [];
  for (let index = 0; index < parts.length; index++) {
    generated.push(await createCatalogPdfPart(parts[index], {
      scopeKey: input.scopeKey, title: input.title, snapshotHash: input.snapshotHash,
      partNumber: index + 1, partCount: parts.length,
    }));
  }
  return generated;
}

async function createCatalogPdf(products: CatalogProductImage[], slug: string, title: string, fingerprint: string) {
  const filename = `catalogo-${slug}-${fingerprint}.pdf`;
  const relativeUrl = `/uploads/catalogs/${filename}`;
  const outputPath = path.join(CATALOG_DIRECTORY, filename);

  await mkdir(CATALOG_DIRECTORY, { recursive: true });

  try {
    await access(outputPath);
    const metadata = JSON.parse(await readFile(`${outputPath}.json`, "utf8")) as { productCount: number };
    if (!Number.isInteger(metadata.productCount) || metadata.productCount < 1 || metadata.productCount > products.length) throw new Error("Invalid catalog manifest");
    return {
      absoluteUrl: buildPublicUrl(relativeUrl),
      filename,
      generated: false,
      productCount: metadata.productCount,
      relativeUrl,
    } satisfies GeneratedCatalogPdf;
  } catch {
    // Generate the immutable catalog below.
  }

  // Bound concurrent image decoding; two conversations may generate PDFs at once.
  const imageResults: PromiseSettledResult<Buffer>[] = [];
  for (let index = 0; index < products.length; index += 4) {
    imageResults.push(...await Promise.allSettled(products.slice(index, index + 4).map(loadFirstAvailableImage)));
  }
  const images = imageResults.flatMap((result, index) =>
    result.status === "fulfilled" ? [{ ...products[index], image: result.value }] : [],
  );

  if (!images.length) {
    throw new Error("No se pudo cargar ninguna imagen del catálogo.");
  }

  const unavailableCount = imageResults.length - images.length;
  if (unavailableCount > 0) {
    console.warn("[catalog-pdf] product_images_unavailable", { unavailableCount });
  }

  const pdf = await renderCatalogImagePdf(images, title);
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;

  try {
    await writeFile(temporaryPath, pdf, { flag: "wx" });
    await rename(temporaryPath, outputPath);
    await writeFile(`${outputPath}.json`, JSON.stringify({ productCount: images.length }));
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  return {
    absoluteUrl: buildPublicUrl(relativeUrl),
    filename,
    generated: true,
    productCount: images.length,
    relativeUrl,
  } satisfies GeneratedCatalogPdf;
}

export async function generateProjectorCatalogPdf() {
  const products = await findProjectorImages();

  if (!products.length) {
    throw new Error("No hay proyectores publicados con imagen disponible.");
  }

  const fingerprint = getCatalogFingerprint(products);
  const existing = inFlightCatalogs.get(fingerprint);
  if (existing) {
    return existing;
  }

  const generation = createCatalogPdf(products, "proyectores", "CATÁLOGO DE PROYECTORES", fingerprint).finally(() => {
    inFlightCatalogs.delete(fingerprint);
  });
  inFlightCatalogs.set(fingerprint, generation);
  return generation;
}

export async function generateCatalogPdf(request: CatalogRequest) {
  const products = await findCatalogImages(request.terms);
  if (!products.length) {
    throw new Error(`No encontramos productos publicados para el catálogo de ${request.terms.join(" ")}.`);
  }

  const fingerprint = createHash("sha256").update(request.slug).update(getCatalogFingerprint(products)).digest("hex").slice(0, 16);
  const cacheKey = `${request.slug}-${fingerprint}`;
  const existing = inFlightCatalogs.get(cacheKey);
  if (existing) return existing;

  const generation = createCatalogPdf(products, request.slug, request.title, fingerprint).finally(() => {
    inFlightCatalogs.delete(cacheKey);
  });
  inFlightCatalogs.set(cacheKey, generation);
  return generation;
}

// Compatibility surface used by legacy internal Rocky routes. The live
// WhatsApp flow uses the durable catalog-generation queue; these helpers retain
// the structured result expected by older assistant surfaces.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function generateRequestedCatalogPdf(
  content: string,
  _includeScreenExtenders = false,
  _catalogSnapshot?: unknown,
  // These are intentionally permissive because the legacy assistant owns the
  // richer product snapshot type in a separately deployed release.
  selection?: any,
) {
  void _includeScreenExtenders;
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
