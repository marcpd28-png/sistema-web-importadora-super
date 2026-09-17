import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { matchProductIdentities, productQueryTokens, type ProductIdentity } from "@/lib/router-v2-product-query";
import { resolveRouterV2TextProduct } from "@/lib/router-v2-text-product-resolver";
import { buildRouterV2ProductDecision } from "@/lib/router-v2-product-decision";
import { buildRouterV2DecisionStatePatch } from "@/lib/router-v2-state-transition";
import { buildRouterV2ResponsePlan } from "@/lib/router-v2-response-plan";
import { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";
import { buildRouterV2ResponseDraft } from "@/lib/router-v2-response-draft";
import { buildRouterV2OutboundMessages } from "@/lib/router-v2-channel-response";
import { resolveRouterV2VisualProduct } from "@/lib/router-v2-visual-product-resolver";
import { resolveRouterV2CatalogFlow } from "@/lib/router-v2-catalog-flow";
import { analyzeRouterV2Message } from "@/lib/conversation-router-v2";

function product(id: string, name: string, brand = "", overrides = {}) {
  return { id, code: id, externalCode: null, name, brand, category: null, slug: id,
    isVisible: true, stockUnits: 5, unitPrice: 99, wholesalePrice: null, wholesaleMinQty: 3,
    imageUrl: null, localImageUrl: null, media: [], ...overrides };
}
const inventory = [
  product("CE105", "CELULAR REDMI NOTE 15 8+256GB BLACK", "XIAOMI", { isVisible: false, stockUnits: 0, unitPrice: 899 }),
  product("CE106", "CELULAR REDMI NOTE 15 PRO 8+256GB BLACK", "XIAOMI"),
  product("CE107", "CELULAR REDMI NOTE 15 PRO+ 8+512GB BLACK", "XIAOMI"),
  product("CE108", "CELULAR REDMI NOTE 15 8+128GB BLACK", "XIAOMI"),
  product("JB6", "PARLANTE JBL CHARGE 6 BLACK", "JBL"),
  product("JB6B", "PARLANTE JBL CHARGE 6 BLUE", "JBL"),
  product("JB7", "PARLANTE JBL CHARGE 7", "JBL", { stockUnits: 0 }),
  product("SA55", "CELULAR SAMSUNG GALAXY A55 256GB", "SAMSUNG"),
  product("SO", "AUDIFONO SONY WH-1000XM5", "SONY"),
  product("UG", "CABLE UGREEN USB TIPO C 100W", "UGREEN"),
  product("LI", "LICUADORA OSTER 700W", "OSTER"),
];

test("cleans polite language and preserves exact model, capacity and variant", () => {
  assert.deepEqual(productQueryTokens("Readmi note 15 de 256, precio x favor &#x20;"), ["REDMI", "NOTE", "15", "256"]);
  for (const [query, ids] of [
    ["Readmi note 15 de 256, precio x favor", ["CE105"]],
    ["Redmi note15 pro+ 512GB", ["CE107"]],
    ["Redmi note 15 pro de 256", ["CE106"]],
    ["Redmi note 15 128 GB", ["CE108"]],
    ["Samsumg Galaxy A55 de 256 precio porfa", ["SA55"]],
    ["precio del parlante JBL chagre 6 gracias", ["JB6", "JB6B"]],
    ["quiero saber precio de licuadras Oster 700W por favor", ["LI"]],
    ["cables UGREEN tipo C 100 W", ["UG"]],
    ["Sony WH-1000XM5", ["SO"]],
    ["(CE105)", ["CE105"]],
  ] as Array<[string, string[]]>) {
    assert.deepEqual(matchProductIdentities(query, inventory).matches.map((p) => p.id), ids, query);
  }
});

test("never replaces numbers, capacity or variant; no broad synonym fallback", () => {
  assert.equal(matchProductIdentities("Xiaomi note 15 256", [product("X", "NOTE 15 5G 8GB + 256GB XIAOMI")]).matches.length, 1);
  for (const query of ["Redmi note 16 256", "Redmi note 15 1024", "Redmi note 15 pro 512", "JBL charge 8", "Samsung A56 256", "audifonos JBL charge 6", "Sony WH-1000XM4"]) {
    assert.equal(matchProductIdentities(query, inventory).matches.length, 0, query);
  }
});

test("ambiguous spelling requires clarification instead of picking a different identity", () => {
  const identities: ProductIdentity[] = [product("1", "MODELO CHARGE 6"), product("2", "MODELO CHARGO 6")];
  const result = matchProductIdentities("chargi 6", identities);
  assert.equal(result.matches.length, 2);
  assert.equal(result.ambiguousSpelling, true);
  // A word with digits is never fuzzy-corrected.
  assert.equal(matchProductIdentities("charg9", identities).matches.length, 0);
});

test("availability rule protects hidden data and applies to every product family", async (t) => {
  const rows = inventory.map((item) => ({ ...item }));
  const originalFindMany = prisma.product.findMany;
  t.after(() => { prisma.product.findMany = originalFindMany; });
  prisma.product.findMany = (async (input: unknown) => {
    const args = input as { where?: { id?: { in: string[] }; isVisible?: boolean; stockUnits?: { gt: number } }; select: Record<string, unknown>; take?: number };
    let found = rows.filter((p) => !args.where?.id || args.where.id.in.includes(p.id));
    if (args.where?.isVisible) found = found.filter((p) => p.isVisible);
    if (args.where?.stockUnits) found = found.filter((p) => p.stockUnits > args.where!.stockUnits!.gt);
    return found.slice(0, args.take).map((p) => Object.fromEntries(Object.keys(args.select).map((key) => [key, p[key as keyof typeof p]])));
  }) as typeof prisma.product.findMany;
  const hidden = await resolveRouterV2TextProduct("Readmi note 15 de 256, precio x favor");
  assert.equal(hidden.status, "UNAVAILABLE");
  assert.equal(hidden.unavailableReason, "NOT_PUBLIC");
  assert.deepEqual(hidden.matches, []);
  assert.doesNotMatch(JSON.stringify(hidden), /899|CE105|BLACK|producto\//);
  const exhausted = await resolveRouterV2TextProduct("precio JBL charge 7 porfa");
  assert.equal(exhausted.unavailableReason, "OUT_OF_STOCK");
  const available = await resolveRouterV2TextProduct("Samsumg Galaxy A55 256 precio");
  assert.equal(available.status, "UNIQUE");
  assert.equal(available.matches[0].unitPrice, 99);
  assert.equal((await resolveRouterV2TextProduct("JBL charge 6")).status, "MULTIPLE");
  assert.equal((await resolveRouterV2TextProduct("JBL charge 99")).status, "NOT_FOUND");
  assert.equal((await resolveRouterV2TextProduct("precio por favor")).status, "NO_QUERY");

  // Cached identity must never cache commercial availability or price.
  rows.find((p) => p.id === "SA55")!.unitPrice = 149;
  assert.equal((await resolveRouterV2TextProduct("Samsung A55 256")).matches[0].unitPrice, 149);
  rows.find((p) => p.id === "SA55")!.isVisible = false;
  assert.equal((await resolveRouterV2TextProduct("Samsung A55 256")).status, "UNAVAILABLE");
  const visual = await resolveRouterV2VisualProduct({ code: "CE105", confidence: 0.95 });
  assert.equal(visual.status, "UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(visual), /899|CE105|BLACK/);

  const decision = buildRouterV2ProductDecision(hidden)!;
  const state = buildRouterV2DecisionStatePatch({
    basePatch: { selectedProductCode: "OLD", unitPrice: 123, total: 246, quantity: 2 },
    finalAction: decision.action, productDecision: decision, productReference: null,
  });
  assert.equal(state.selectedProductCode, null);
  assert.equal(state.unitPrice, null);
  assert.equal(state.total, null);
  const plan = buildRouterV2ResponsePlan({ finalAction: decision.action, state: null, productQuestion: "PRICE", productInformationAvailable: true });
  const context = buildRouterV2ResponseContext({ customerMessage: "Readmi note 15 de 256, precio x favor", responsePlan: plan, state: null, commercialPrice: null });
  const draft = buildRouterV2ResponseDraft(context);
  assert.match(draft, /no tengo disponible.*REDMI NOTE 15 256/);
  assert.doesNotMatch(draft, /899|123|246|S\/|identificar|comprar este/);
  assert.deepEqual(buildRouterV2OutboundMessages({ context, draftText: draft }).map((m) => m.type), ["TEXT"]);
  const stockPlan = buildRouterV2ResponsePlan({ finalAction: "PRODUCT_OUT_OF_STOCK", state: null });
  assert.match(buildRouterV2ResponseDraft(buildRouterV2ResponseContext({ customerMessage: "JBL charge 7", responsePlan: stockPlan, state: null, commercialPrice: null })), /agotado.*alternativas/);
});

test("specific product questions are not swallowed by retail/catalog mode", () => {
  for (const customerData of [{ shoppingMode: "RETAIL" }, { catalogPending: true }]) {
    for (const content of ["Samsung A55 256 precio por favor", "precio de audifonos JBL", "informacion de licuadoras Oster", "Airpods Pro"]) {
      const decision = resolveRouterV2CatalogFlow({ content, analysis: analyzeRouterV2Message({ content }), currentState: { customerData } });
      assert.equal(decision.action, "NONE", content);
    }
  }
});
