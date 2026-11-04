import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import {
  CatalogPdfImageCoverageError,
  CatalogPdfSizeLimitError,
  isGeneralCatalogRequest,
  isProjectorCatalogRequest,
  loadCatalogImagesStrict,
  parseCatalogRequest,
  prepareCatalogImage,
  splitCatalogItemsByRenderedSize,
} from "@/lib/catalog-pdf";

test("detecta solicitudes del catálogo general aunque usen lenguaje cortés", () => {
  assert.equal(isGeneralCatalogRequest("¿Me podría brindar el catálogo?"), true);
  assert.equal(isGeneralCatalogRequest("Quiero el catálogo completo, por favor"), true);
  assert.equal(isGeneralCatalogRequest("Hola quiero consultar por el catálogo"), true);
  assert.equal(isGeneralCatalogRequest("¿Dónde veo el catálogo virtual?"), true);
  assert.equal(isGeneralCatalogRequest("Pásame el link del catálogo online"), true);
  assert.equal(isGeneralCatalogRequest("Hola buenos días me podría enviar su catálogo por favor"), true);
  assert.equal(isGeneralCatalogRequest("Hola catalgo virtual"), true);
  assert.equal(isGeneralCatalogRequest("Me mandas el catalog online"), true);
  assert.equal(isGeneralCatalogRequest("¿Tienen catálogo de parlantes JBL?"), false);
});

test("detecta solicitudes explícitas del catálogo de proyectores", () => {
  assert.equal(isProjectorCatalogRequest("Hola, catálogo de proyectores"), true);
  assert.equal(isProjectorCatalogRequest("CATALOGO PROYECTOR"), true);
  assert.equal(isProjectorCatalogRequest("¿Me mandas el catálogo de proyectores?"), true);
});

test("acepta plural y errores frecuentes al pedir catálogos por categoría y marca", () => {
  assert.deepEqual(parseCatalogRequest("catalogos audifonos jbl")?.terms, ["audifonos", "jbl"]);
  assert.deepEqual(parseCatalogRequest("Catálogo de parlantes JBL")?.terms, ["parlantes", "jbl"]);
  assert.deepEqual(parseCatalogRequest("Catálogo de ventiladores")?.terms, ["ventiladores"]);
  assert.deepEqual(parseCatalogRequest("Catálogo de celulares")?.terms, ["celulares"]);
  assert.deepEqual(parseCatalogRequest("catalgoo de audifonos")?.terms, ["audifonos"]);
  assert.deepEqual(parseCatalogRequest("cataglafo audifonos jbl")?.terms, ["audifonos", "jbl"]);
  assert.deepEqual(parseCatalogRequest("Hola catálogo de parlantes")?.terms, ["parlantes"]);
  assert.deepEqual(parseCatalogRequest("cata parlantes")?.terms, ["parlantes"]);
  assert.deepEqual(parseCatalogRequest("catallgos específicos de parlantes")?.terms, ["parlantes"]);
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

test("divide por bytes sin cambiar el orden ni perder productos", async () => {
  const parts = await splitCatalogItemsByRenderedSize(
    ["A", "B", "C", "D", "E"],
    async (items) => Buffer.alloc(items.length * 10),
    20,
  );

  assert.deepEqual(parts.map((part) => part.items), [["A", "B"], ["C"], ["D", "E"]]);
  assert.deepEqual(parts.flatMap((part) => part.items), ["A", "B", "C", "D", "E"]);
  assert.ok(parts.every((part) => part.pdf.byteLength <= 20));
  await assert.rejects(
    () => splitCatalogItemsByRenderedSize(["demasiado-grande"], async () => Buffer.alloc(21), 20),
    CatalogPdfSizeLimitError,
  );
});

test("nunca omite un producto cuya foto real no pueda cargarse", async () => {
  const base = {
    name: "Producto de prueba",
    imageUrls: ["/uploads/products/prueba.jpg"],
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    unitPrice: 10,
    wholesalePrice: null,
    wholesaleMinQty: 1,
  };
  const products = [
    { ...base, id: "1", code: "UNO" },
    { ...base, id: "2", code: "DOS" },
  ];

  await assert.rejects(
    () => loadCatalogImagesStrict(products, async (product) => {
      if (product.code === "DOS") throw new Error("image unavailable");
      return Buffer.from("real-image-bytes");
    }),
    (error: unknown) => error instanceof CatalogPdfImageCoverageError && error.productCodes.join(",") === "DOS",
  );
});
