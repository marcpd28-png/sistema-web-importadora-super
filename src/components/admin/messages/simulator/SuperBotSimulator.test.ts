import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("las tarjetas del simulador se muestran como un carrusel de imágenes seleccionables sin captions", () => {
  const source = readFileSync(new URL("./SuperBotSimulator.tsx", import.meta.url), "utf8");
  assert.match(source, /function ProductCarousel/);
  assert.match(source, /groupVisualCards\(turns\)/);
  assert.match(source, /scrollBy/);
  assert.match(source, /aria-pressed=/);
  assert.match(source, /!turn\.productCard && !turn\.paymentMethodsImage/);
  assert.match(source, /image\/jpeg,image\/png,image\/webp/);
  assert.match(source, /input_image|captura/i);
});

test("el mensaje del bot define un color legible en tema claro y oscuro", () => {
  const css = readFileSync(new URL("./SuperBotSimulator.module.css", import.meta.url), "utf8");
  assert.match(css, /\.botTurn \{[\s\S]*?color: #14243a/);
  assert.match(css, /body\[data-admin-theme="dark"\][\s\S]*?\.botTurn p[\s\S]*?#e4edf4/);
});
