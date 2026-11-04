import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeStoreReply } from "./store-reply-policy";
test("store assistant provides human contact instead of empty or unavailable answers", () => {
  for (const text of ["", "No encontré productos", "No pude encontrar ese modelo"]) {
    const result = finalizeStoreReply({ text });
    assert.equal(result.text, "No ubico el producto. ¿Tienes foto, código o modelo?");
    assert.equal(result.quickActions?.[0].href, "https://m.me/importacionessuperoficial");
    assert.equal(result.meta?.usedOllama, false);
  }
});
test("verified store replies retain their relevant catalog actions", () => {
  const result = finalizeStoreReply({ text: "Producto disponible", quickActions: [{ label: "Buscar", href: "/?q=iphone+15+precio" }, { label: "Producto", href: "/producto/iphone-15" }] });
  assert.deepEqual(result.quickActions?.map(x => x.href), ["/?q=iphone+15+precio", "/producto/iphone-15"]);
});
test("fallback contact uses the configured Messenger URL", () => {
  const result = finalizeStoreReply({ text: "" }, "https://m.me/atencion-configurada");
  assert.equal(result.quickActions?.[0]?.href, "https://m.me/atencion-configurada");
});
