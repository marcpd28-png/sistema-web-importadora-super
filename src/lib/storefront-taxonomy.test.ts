import assert from "node:assert/strict";
import test from "node:test";
import { categoryMatches, getStorefrontCategorySlug, groupColorVariants, variantColor } from "./storefront-taxonomy";

const cases = [
  ["N2220", "SQ PROYECTOR HY400 PRO MARCA SUPER", "proyectores"],
  ["O589", "HAVIT PROYECTOR PJ209A PLUS", "proyectores"],
  ["N2078", "SQ TELA PARA PROJECTOR 120 PULGADAS", "pantallas-proyeccion"],
  ["X1", "SOPORTE PARA PROYECTOR", "pantallas-proyeccion"],
  ["O1005", "DRON DJI NEO 2 DRONE ONLY", "drones"],
  ["O1001", "DRON DJI AVATA 360 MOTION FLY MORE COMBO", "drones"],
  ["X2", "BATERIA PARA DRON DJI NEO", "accesorios-drones"],
  ["O256-AZUL", "ECHO SPOT CON RELOJ ALEXA", "alexas"],
  ["X3", "ENCHUFE INTELIGENTE WIFI COMPATIBLE CON ALEXA", "hogar-inteligente"],
  ["P373", "SIMULADOR PARLANTE MAX DISEÑO EMPAQUE AL05", "parlantes"],
  ["N1262", "SQ CONSOLA DE VIDEOJUEGO R36 ULTRA", "consolas"],
  ["PC351", "MANDO GAMEPAD ENKORE", "mandos"],
  ["X5", "MANDO PARA CONSOLA PLAYSTATION", "mandos"],
  ["N1551", "VIBRADOR JUGUETE SEX", "bienestar-intimo"],
  ["N2255", "LAMPARA SOLAR 1500mAh", "iluminacion"],
  ["X4", "LAMPARA SOLAR 5000mAh", "iluminacion"],
  ["N2098", "TALADRO DOBLE BATERIA", "herramientas"],
  ["O902", "CARGADOR SAMSUNG 45W", "cargadores"],
  ["N2325", "SOPORTE PARA LAPTOP METAL", "accesorios-pc"],
  ["O1014-NEGRO", "MOUSE ERGONOMICO VERTICAL", "mouse-teclados"],
  ["L500", "CEPILLO ALISADOR RAF R412", "cabello"],
  ["PC401", "EXTENSOR DE PANTALLA PARA LAPTOP", "monitores"],
];
for (const [code, name, expected] of cases) test(`clasificación comercial: ${code}`, () => {
  assert.equal(getStorefrontCategorySlug({ code, name, category: "NOVEDADES" }), expected);
});

test("la categoría antigua y el acceso de proyectores coinciden sin incluir ecranes", () => {
  assert.ok(categoryMatches("proyectores", "proyectores"));
  assert.ok(!categoryMatches("pantallas-proyeccion", "proyectores"));
  assert.ok(categoryMatches("pantallas-proyeccion", "familia-tv-videojuegos"));
  assert.ok(categoryMatches("smartwatches", "smart-watch-y-sus-complementos"));
  assert.ok(categoryMatches("correas", "smart-watch-y-sus-accesorios"));
});
test("colores del mismo SKU y modelo se agrupan, modelos distintos no", () => {
  const rows = [
    { id: "1", code: "O292-NEGRO", name: "(O292-NEGRO) REDMI WATCH 5 ACTIVE NEGRO 002220", brand: "Xiaomi" },
    { id: "2", code: "O292-SILVER", name: "(O292-SILVER) REDMI WATCH 5 ACTIVE SILVER 002221", brand: "Xiaomi" },
    { id: "3", code: "O292-AZUL", name: "REDMI WATCH 5 LITE AZUL", brand: "Xiaomi" },
    { id: "4", code: "O777-NEGRO", name: "REDMI WATCH 5 ACTIVE NEGRO", brand: "Xiaomi" },
  ];
  assert.deepEqual(groupColorVariants(rows).map(g => g.map(p => p.id)), [["1", "2"], ["3"], ["4"]]);
  assert.equal(variantColor(rows[1]), "SILVER");
});
test("registros similares sin color no se fusionan ni pierden SKU", () => {
  const rows = [{ id: "1", code: "N755", name: "CONSOLA R36S" }, { id: "2", code: "N755-SQ", name: "CONSOLA R36S" }];
  assert.equal(groupColorVariants(rows).length, 2);
});
