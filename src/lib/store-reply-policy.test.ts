import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeStoreReply } from "./store-reply-policy";
test("store assistant provides human contact instead of empty or unavailable answers", () => {
  for (const text of ["", "No encontré productos", "No pude encontrar ese modelo"]) {
    const result = finalizeStoreReply({ text }, "https://wa.me/51900000000");
    assert.match(result.text, /asesor/);
    assert.equal(result.quickActions?.[0].href, "https://wa.me/51900000000");
    assert.equal(result.meta?.usedOllama, false);
  }
});
test("unverified filtered links are removed, direct product links retained", () => {
  const result = finalizeStoreReply({ text: "Producto disponible", quickActions: [{ label: "Buscar", href: "/?q=iphone+15+precio" }, { label: "Producto", href: "/producto/iphone-15" }] }, "https://wa.me/51900000000");
  assert.deepEqual(result.quickActions?.map(x => x.href), ["/producto/iphone-15"]);
});
