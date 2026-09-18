import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { generateRequestedCatalogPdf, generateRequestedProductImages, isProjectorCatalogRequest, prepareCatalogImage, renderScopedCatalogPdf } from "@/lib/catalog-pdf";
import { createCommercialCatalog, type CommercialProduct } from "./commercial-catalog";

test("el catálogo distribuye como máximo dos productos por hoja A4 horizontal", async () => {
  const image = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#2320DA" } }).jpeg().toBuffer();
  for (const count of [1, 2, 3, 4, 5]) {
    const items = Array.from({ length: count }, (_, index) => ({
      image: index === 2 ? null : image,
      name: `PARLANTE JBL ${index} ${"DESCRIPCIÓN LARGA ".repeat(12)}`,
      code: `TEST-${index}`, brand: "JBL",
    }));
    const pdf = (await renderScopedCatalogPdf(items, "Catálogo de parlantes JBL")).toString("latin1");
    const expectedPages = Math.ceil(count / 2);
    assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, expectedPages);
    assert.equal((pdf.match(/\/MediaBox \[0 0 841\.89 595\.28\]/g) ?? []).length, expectedPages);
    assert.equal((pdf.match(/\/Subtype \/Image\b/g) ?? []).length, count - (count >= 3 ? 1 : 0));
  }
});

test("detecta solicitudes explícitas del catálogo de proyectores", () => {
  assert.equal(isProjectorCatalogRequest("Hola, catálogo de proyectores"), true);
  assert.equal(isProjectorCatalogRequest("CATALOGO PROYECTOR"), true);
  assert.equal(isProjectorCatalogRequest("¿Me mandas el catálogo de proyectores?"), true);
});

test("quita márgenes transparentes sin convertir la foto rectangular en un cuadrado", async () => {
  const source = await sharp({ create: { width: 200, height: 400, channels: 4, background: "#2320DA" } })
    .extend({ top: 100, bottom: 100, left: 200, right: 200, background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png().toBuffer();
  const image = await prepareCatalogImage(source);
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.width, 200);
  assert.equal(metadata.height, 400);
  assert.equal(metadata.format, "jpeg");
});

test("no intercepta consultas comunes ni catálogos de otra categoría", () => {
  assert.equal(isProjectorCatalogRequest("¿Qué proyectores tienes?"), false);
  assert.equal(isProjectorCatalogRequest("Catálogo de cámaras"), false);
  assert.equal(isProjectorCatalogRequest("Hola"), false);
});

test("PDF, manifest, cached count and image messages contain only products with readable photos", async t => {
  const prefix = `availability-test-${randomUUID()}`;
  const sourcePath = path.join(process.cwd(), "public", "uploads", `${prefix}.png`);
  const sourceUrl = `/uploads/${prefix}.png`;
  const created = new Set([sourcePath]);
  t.after(async () => { await Promise.all([...created].map(file => unlink(file).catch(() => undefined))); });
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, await sharp({ create: { width: 100, height: 160, channels: 3, background: "#2320DA" } }).png().toBuffer());
  const product = (code: string, overrides = {}) => ({ id: code, code, name: `PARLANTE JBL ${code}`, brand: "JBL", category: "PARLANTES", isVisible: true, stockUnits: 10, imageUrl: sourceUrl, media: [], updatedAt: new Date("2026-09-18"), unitPrice: 99, ...overrides }) as unknown as CommercialProduct;
  const snapshot = createCommercialCatalog([
    product("VALID"), product("BROKEN", { imageUrl: `/uploads/${prefix}-missing.png` }),
    product("HIDDEN", { isVisible: false }), product("EMPTY", { stockUnits: 0 }),
    product("MISSING", { imageUrl: null }), product("PLACEHOLDER", { imageUrl: "/uploads/sin-foto.png" }),
  ]);
  for (const large of [false, true]) {
    const result = await generateRequestedCatalogPdf("catálogo parlantes JBL", large, snapshot);
    assert(result.catalog);
    const file = path.join(process.cwd(), "public", result.catalog.relativeUrl);
    const manifest = path.join(process.cwd(), ".cache", "catalog-manifests", `${result.catalog.filename}.json`);
    created.add(file); created.add(manifest);
    assert.equal((await readFile(file)).subarray(0, 5).toString(), "%PDF-");
    assert.equal(result.catalog.productCount, 1);
    assert.deepEqual(result.products.map(p => p.code), ["VALID"]);
    assert.deepEqual(JSON.parse(await readFile(manifest, "utf8")).codes, ["VALID"]);
    const cached = await generateRequestedCatalogPdf("catálogo parlantes JBL", large, snapshot);
    assert.equal(cached.catalog?.generated, false);
    assert.equal(cached.catalog?.productCount, 1);
    const paraphrase = await generateRequestedCatalogPdf("Necesitaría revisar catálogo de parlantes JBL cuando puedan", large, snapshot);
    assert.equal(paraphrase.catalog?.filename, result.catalog.filename);
    assert.equal(paraphrase.catalog?.generated, false);
  }
  const images = await generateRequestedProductImages("parlantes JBL", snapshot);
  assert.equal(images.outboundMessages.length, 1);
  assert.equal(images.outboundMessages[0].type, "IMAGE");
  assert.match(images.outboundMessages[0].content, /^1\/1/);
  created.add(path.join(process.cwd(), "public", new URL(images.outboundMessages[0].mediaUrl).pathname));
  await unlink(sourcePath);
  const removedPhoto = await generateRequestedCatalogPdf("catálogo parlantes JBL", false, snapshot);
  assert.equal(removedPhoto.catalog, null, "a cached PDF cannot bypass failed photos");
  assert.deepEqual(removedPhoto.products, []);
});
