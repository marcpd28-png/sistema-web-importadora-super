import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import PDFDocument from "pdfkit";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { buildPublicUrl } from "@/lib/site-url";
import { createCatalogIndex } from "@/lib/catalog-selection";
import { getCatalogReferenceBrands } from "@/lib/catalog-reference-brands";
import { resolveProductBrand } from "@/lib/product-discovery";

const CATALOG_DIRECTORY = path.join(process.cwd(), "public", "uploads", "catalogs");
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 12_000;
const BRAND_PRIMARY = "#2320DA";

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

async function findProjectorImages(): Promise<CatalogProductImage[]> {
  const products = await prisma.product.findMany({
    where: {
      isVisible: true,
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

export function renderCatalogImagePdf(images: { image: Buffer | null; name: string; code: string }[], title = "Catálogo de Proyectores") {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      compress: true,
      info: {
        Author: "Importaciones Super",
        Creator: "Tienda Virtual Importaciones Super",
        Subject: title,
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
        .text(title.toUpperCase(), marginX, 30, {
          align: "center",
          width: imageWidth,
        });
      document.moveTo(marginX, 66).lineTo(pageWidth - marginX, 66)
        .lineWidth(2).strokeColor(BRAND_PRIMARY).stroke();
      if (product.image) document.image(product.image, marginX, headerHeight, {
        align: "center",
        fit: [imageWidth, 605],
        valign: "center",
      });
      else document.fillColor("#666666").font("Helvetica").fontSize(16).text("Imagen no disponible", marginX, 350, { width: imageWidth, align: "center" });
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

async function createProjectorCatalogPdf(products: CatalogProductImage[], fingerprint: string) {
  const filename = `catalogo-proyectores-${fingerprint}.pdf`;
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

  const pdf = await renderCatalogImagePdf(images);
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

  const generation = createProjectorCatalogPdf(products, fingerprint).finally(() => {
    inFlightCatalogs.delete(fingerprint);
  });
  inFlightCatalogs.set(fingerprint, generation);
  return generation;
}

type ScopedCatalogItem = CatalogProductImage & { brand: string | null; category: string | null };

export function renderScopedCatalogPdf(items: { image: Buffer | null; name: string; code: string; brand: string }[], title: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, compress: true, size: "A4", margin: 0,
      info: { Title: title, Author: "Importaciones Super", Subject: title } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const pages = Math.ceil(items.length / 4);
    for (let page = 0; page < pages; page++) {
      doc.addPage();
      doc.fillColor(BRAND_PRIMARY).font("Helvetica-Bold").fontSize(19);
      let titleSize = 19;
      while (doc.heightOfString(title, { width: 523 }) > 48 && titleSize > 10) doc.fontSize(--titleSize);
      doc.text(title, 36, 26, { width: 523, height: 48, align: "center" });
      doc.fillColor("#666666").font("Helvetica").fontSize(9)
        .text(`Importaciones Super | ${items.length} productos | Agrupados por marca`, 36, 78, { width: 523, align: "center" });
      for (let slot = 0; slot < 4; slot++) {
        const item = items[page * 4 + slot];
        if (!item) break;
        const x = 28 + (slot % 2) * 274;
        const y = 108 + Math.floor(slot / 2) * 342;
        doc.roundedRect(x, y, 265, 330, 8).lineWidth(0.6).strokeColor("#DEDEEE").stroke();
        doc.fillColor(BRAND_PRIMARY).font("Helvetica-Bold").fontSize(10)
          .text(item.brand, x + 12, y + 12, { width: 241, align: "center", height: 26 });
        if (item.image) doc.image(item.image, x + 12, y + 40, { fit: [241, 195], align: "center", valign: "center" });
        else doc.fillColor("#777777").font("Helvetica").fontSize(12)
          .text("Imagen no disponible", x + 12, y + 115, { width: 241, align: "center" });
        doc.fillColor("#17172B").font("Helvetica-Bold").fontSize(11);
        let size = 11;
        while (doc.heightOfString(item.name, { width: 241 }) > 50 && size > 8) doc.fontSize(--size);
        doc.text(item.name, x + 12, y + 249, { width: 241, height: 50, ellipsis: true, align: "center" });
        doc.fillColor(BRAND_PRIMARY).font("Helvetica").fontSize(10)
          .text(`Código: ${item.code}`, x + 12, y + 310, { width: 241, align: "center" });
      }
      doc.fillColor("#666666").font("Helvetica").fontSize(9)
        .text(`${page + 1} / ${pages}`, 36, 810, { width: 523, align: "center" });
    }
    doc.end();
  });
}

async function createScopedCatalogPdf(products: ScopedCatalogItem[], label: string, fingerprint: string, largeImages = false) {
  const slug = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70);
  const filename = `catalogo-${slug}-${fingerprint}.pdf`;
  const relativeUrl = `/uploads/catalogs/${filename}`;
  const outputPath = path.join(CATALOG_DIRECTORY, filename);
  const result = { absoluteUrl: buildPublicUrl(relativeUrl), filename, productCount: products.length, relativeUrl };
  await mkdir(CATALOG_DIRECTORY, { recursive: true });
  try { await access(outputPath); return { ...result, generated: false }; } catch { /* Generate below. */ }
  const images: { image: Buffer | null; name: string; code: string; brand: string }[] = new Array(products.length);
  let next = 0;
  // Bound image decoding to avoid exhausting memory for a category with hundreds of products.
  await Promise.all(Array.from({ length: Math.min(4, products.length) }, async () => {
    while (next < products.length) {
      const index = next++;
      const product = products[index];
      let image: Buffer | null = null;
      try { image = await sharp(await loadFirstAvailableImage(product)).resize({ width: largeImages ? 1600 : 800, height: largeImages ? 1600 : 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: largeImages ? 90 : 78 }).toBuffer(); } catch { /* Keep the product even without a usable image. */ }
      images[index] = { image, name: product.name, code: product.code, brand: resolveProductBrand(product) || "Otras marcas" };
    }
  }));
  const pdf = largeImages ? await renderCatalogImagePdf(images, "Extensores de pantalla") : await renderScopedCatalogPdf(images, `Catálogo de ${label}`);
  const temporary = `${outputPath}.${process.pid}.tmp`;
  try { await writeFile(temporary, pdf, { flag: "wx" }); await rename(temporary, outputPath); }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  return { ...result, generated: true };
}

async function selectRequestedCatalog(content: string) {
  const rows = await prisma.product.findMany({
    where: { isVisible: true },
    select: { id: true, code: true, name: true, unitPrice: true, brand: true, category: true, categoryRef: { select: { name: true } }, imageUrl: true, localImageUrl: true, sourceImageUrl: true, updatedAt: true,
      media: { orderBy: { sortOrder: "asc" }, select: { url: true } } },
  });
  const index = createCatalogIndex(rows, await getCatalogReferenceBrands());
  const selection = index.select(content);
  const products = selection.products.map(p => ({ ...p, brand: index.productBrand(p), imageUrls: [...new Set([p.localImageUrl, ...p.media.map(m => m.url), p.sourceImageUrl, p.imageUrl].filter((v): v is string => Boolean(v?.trim())))] }));
  return { ...selection, products };
}

export async function generateRequestedCatalogPdf(content: string, largeImages = false) {
  const selection = await selectRequestedCatalog(content);
  const products = selection.products;
  if (!selection.scoped || !products.length) return { ...selection, catalog: null };
  const fingerprint = createHash("sha256").update(`${largeImages ? "full-page-v1" : "scoped-grid-v2"}:${selection.label}:${JSON.stringify(products.map(p => p.brand))}:${getCatalogFingerprint(products)}`).digest("hex").slice(0, 16);
  let generation = inFlightCatalogs.get(fingerprint);
  if (!generation) {
    generation = createScopedCatalogPdf(products, selection.label, fingerprint, largeImages).finally(() => inFlightCatalogs.delete(fingerprint));
    inFlightCatalogs.set(fingerprint, generation);
  }
  return { ...selection, catalog: await generation };
}

export async function generateRequestedProductImages(content: string) {
  const selection = await selectRequestedCatalog(content);
  await mkdir(CATALOG_DIRECTORY, { recursive: true });
  const outboundMessages = await Promise.all(selection.products.map(async (product, index) => {
    const caption = `${index + 1}/${selection.products.length} · ${product.name}\nCódigo: ${product.code} · Precio unitario: S/${Number(product.unitPrice).toFixed(2)}`;
    const fingerprint = getCatalogFingerprint([product]);
    const filename = `producto-${fingerprint}.jpg`;
    const output = path.join(CATALOG_DIRECTORY, filename);
    try {
      try { await access(output); } catch {
        const bytes = await loadFirstAvailableImage(product);
        const temporary = `${output}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, bytes);
        await rename(temporary, output);
      }
      return { type: "IMAGE" as const, content: caption, mediaUrl: buildPublicUrl(`/uploads/catalogs/${filename}`), code: product.code };
    } catch {
      return { type: "TEXT" as const, content: `${caption}\nImagen no disponible.`, mediaUrl: null, code: product.code };
    }
  }));
  return { ...selection, outboundMessages };
}
