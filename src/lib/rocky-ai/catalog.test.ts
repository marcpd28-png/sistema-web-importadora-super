import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatalogPreparedRequest } from "../catalog-generation";
import { prepareSuperBotCatalog } from "./catalog";
import type { HistoryItem } from "./policy";
import { catalogPreview } from "./service";

function history(...items: Array<Pick<HistoryItem, "role" | "text">>): HistoryItem[] {
  return items.map((item, index) => ({ ...item, id: `m-${index}`, at: new Date(1_700_000_000_000 + index).toISOString() }));
}

function ready(title: string): CatalogPreparedRequest {
  return {
    kind: "ready", scope: { kind: "category", key: "parlantes", category: "parlantes", title }, snapshotHash: "a".repeat(32), excludedForPhotoPolicy: 0,
    snapshot: { version: 1, scopeKey: "parlantes", title, capturedAt: new Date().toISOString(), products: [{
      id: "p1", name: "Parlante", code: "P1", brand: "JBL", category: "parlantes", imageUrls: ["/uploads/products/p1.jpg"],
      updatedAt: new Date().toISOString(), unitPrice: "100", wholesalePrice: null, wholesaleMinQty: 3,
    }] },
  };
}

test("direct category and brand catalog requests remain server-scoped", async () => {
  const received: string[] = [];
  const prepare = async (content: string) => {
    received.push(content);
    return ready(/sony/i.test(content) ? "CATÁLOGO DE PARLANTES SONY" : "CATÁLOGO DE PARLANTES");
  };
  const all = await prepareSuperBotCatalog(history({ role: "user", text: "Quiero catálogo de parlantes" }), prepare);
  const sony = await prepareSuperBotCatalog(history({ role: "user", text: "Catálogo de parlantes Sony" }), prepare);
  assert.equal(all?.prepared.kind, "ready");
  assert.equal(sony?.prepared.kind, "ready");
  assert.deepEqual(received, ["Quiero catálogo de parlantes", "Catálogo de parlantes Sony"]);
  assert.equal((sony?.prepared.kind === "ready" ? sony.prepared.scope.title : ""), "CATÁLOGO DE PARLANTES SONY");
});

test("a bare catalog request inherits the latest customer product wording", async () => {
  const received: string[] = [];
  const plan = await prepareSuperBotCatalog(history(
    { role: "user", text: "Hola, busco parlantes JBL" },
    { role: "assistant", text: "Encontré opciones." },
    { role: "user", text: "Pásame el catálogo" },
  ), async content => { received.push(content); return ready("CATÁLOGO DE PARLANTES JBL"); });
  assert.equal(plan?.fromConversationContext, true);
  assert.deepEqual(received, ["catálogo de parlantes jbl"]);
  assert.equal(plan?.request, "catálogo de parlantes jbl");
});

test("the simulator renders a verified catalog snapshot as a PDF preview without a delivery job", async () => {
  const plan = await prepareSuperBotCatalog(history({ role: "user", text: "Catálogo de parlantes JBL" }), async () => ready("CATÁLOGO DE PARLANTES JBL"));
  const rendered = {
    input: null as { scopeKey: string; title: string; snapshotHash: string; products: Array<{ id: string }> } | null,
  };
  const preview = await catalogPreview(plan, async input => {
    rendered.input = input;
    return [{
      absoluteUrl: "https://tiendavirtualsuper.com/uploads/catalogs/catalogo-jbl.pdf",
      relativeUrl: "/uploads/catalogs/catalogo-jbl.pdf",
      filename: "catalogo-jbl.pdf",
      partNumber: 1,
      partCount: 1,
      productCount: 1,
      missingImageCount: 0,
      byteLength: 100,
    }];
  });
  assert.equal(rendered.input?.scopeKey, "parlantes");
  assert.equal(rendered.input?.products[0]?.id, "p1");
  assert.deepEqual(preview?.documents, [{ relativeUrl: "/uploads/catalogs/catalogo-jbl.pdf", filename: "catalogo-jbl.pdf", partNumber: 1, partCount: 1, productCount: 1 }]);
});
