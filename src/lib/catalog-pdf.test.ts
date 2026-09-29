import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import {
  isGeneralCatalogRequest,
  isProjectorCatalogRequest,
  parseCatalogRequest,
  prepareCatalogImage,
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
  assert.deepEqual(parseCatalogRequest("catalgoo de audifonos")?.terms, ["audifonos"]);
  assert.deepEqual(parseCatalogRequest("cataglafo audifonos jbl")?.terms, ["audifonos", "jbl"]);
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
