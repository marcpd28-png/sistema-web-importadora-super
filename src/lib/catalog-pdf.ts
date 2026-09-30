import { findCatalogProductIds, productQueryTerms } from "./rocky-product-query";
import { createHash } from "node:crypto";
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
const MAX_CATALOG_PRODUCTS = 40;

type CatalogProductImage = {
  id: string;
  name: string;
  code: string;
  imageUrls: string[];
  updatedAt: Date;
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

    return imageUrls.length ? [{ id: product.id, name: product.name, code: product.code, imageUrls, updatedAt: product.updatedAt }] : [];
  });
}

async function findCatalogImages(terms: string[]): Promise<CatalogProductImage[]> {
  const ids = await findCatalogProductIds(terms.join(" "), MAX_CATALOG_PRODUCTS);
  if (!ids.length) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isVisible: true, stockUnits: { gt: 0 }, unitPrice: { gt: 0 } },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, code: true, imageUrl: true, localImageUrl: true,
      media: { orderBy: { sortOrder: "asc" }, select: { url: true } },
      sourceImageUrl: true, updatedAt: true,
    },
  });

  return products.flatMap((product) => {
    const imageUrls = Array.from(new Set([
      product.localImageUrl, ...product.media.map((media) => media.url), product.sourceImageUrl, product.imageUrl,
    ].filter((value): value is string => Boolean(value?.trim()))));
    return imageUrls.length ? [{ id: product.id, name: product.name, code: product.code, imageUrls, updatedAt: product.updatedAt }] : [];
  });
}

function getCatalogFingerprint(products: CatalogProductImage[]) {
  return createHash("sha256")
    .update("large-product-page-v2")
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

async function loadImage(imageUrl: string) {
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
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function loadFirstAvailableImage(product: CatalogProductImage) {
  for (const imageUrl of product.imageUrls) {
    try {
      return await loadImage(imageUrl);
    } catch {
      // Try the next stored source for this product.
    }
  }

  throw new Error(`No available image for product ${product.id}`);
}

export function renderCatalogImagePdf(images: { image: Buffer; name: string; code: string }[], title = "CATÁLOGO DE PRODUCTOS") {
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
      document.image(product.image, marginX, headerHeight, {
        align: "center",
        fit: [imageWidth, 605],
        valign: "center",
      });
      document.fillColor("#17172B").font("Helvetica-Bold").fontSize(17);
      let nameSize = 17;
      while (document.heightOfString(product.name, { width: imageWidth }) > 56 && nameSize > 11) {
        document.fontSize(--nameSize);
      }
      document.text(product.name, marginX, 704, { width: imageWidth, align: "center" });
      document.fillColor(BRAND_PRIMARY).font("Helvetica-Bold").fontSize(15)
        .text(`Código: ${product.code}`, marginX, 768, { width: imageWidth, align: "center" });
      document.fillColor("#666666").font("Helvetica").fontSize(9)
        .text(`${index + 1} / ${images.length}`, marginX, pageHeight - 28, { width: imageWidth, align: "center" });
    });

    document.end();
  });
}

async function createCatalogPdf(products: CatalogProductImage[], slug: string, title: string, fingerprint: string) {
  const filename = `catalogo-${slug}-${fingerprint}.pdf`;
  const relativeUrl = `/uploads/catalogs/${filename}`;
  const outputPath = path.join(CATALOG_DIRECTORY, filename);

  await mkdir(CATALOG_DIRECTORY, { recursive: true });

  try {
    await access(outputPath);
    return {
      absoluteUrl: buildPublicUrl(relativeUrl),
      filename,
      generated: false,
      productCount: products.length,
      relativeUrl,
    } satisfies GeneratedCatalogPdf;
  } catch {
    // Generate the immutable catalog below.
  }

  const imageResults = await Promise.allSettled(products.map(loadFirstAvailableImage));
  const images = imageResults.flatMap((result, index) =>
    result.status === "fulfilled" ? [{ image: result.value, name: products[index].name, code: products[index].code }] : [],
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

// Compatibility surface used by the internal Rocky routes.  The live WhatsApp
// webhook uses generateCatalogPdf directly, while these helpers retain the
// structured result expected by the existing assistant flows.
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
