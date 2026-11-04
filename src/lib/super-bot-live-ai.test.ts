import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SUPER_BOT_LIVE_MODEL,
  composeLiveSuperBotReply,
} from "./super-bot-live-ai";
import type { ShopAssistantReply } from "./shop-assistant-types";

const verifiedReply: ShopAssistantReply = {
  text: "Encontré estas opciones verificadas.",
  products: [
    {
      id: "product-1",
      slug: "parlante-uno",
      code: "PAR-001",
      name: "Parlante Uno",
      description: "Parlante portátil.",
      brand: "Super",
      category: "Parlantes",
      imageUrl: "/uploads/products/par-001.webp",
      outboundImageUrl: "https://images.example.test/par-001.jpg",
      imageAlt: "Parlante Uno",
      technicalSpecs: "Bluetooth 5.3",
      unitPrice: "S/ 99.00",
      unitPriceValue: 99,
      wholesalePrice: null,
      wholesalePriceValue: null,
      wholesaleMinQty: 1,
      availabilityLabel: "Disponible",
      stockUnits: 8,
      unitsPerBox: null,
    },
    {
      id: "product-2",
      slug: "parlante-dos",
      code: "PAR-002",
      name: "Parlante Dos",
      description: "Parlante con batería recargable.",
      brand: "Super",
      category: "Parlantes",
      imageUrl: "/uploads/products/par-002.webp",
      outboundImageUrl: "https://images.example.test/par-002.jpg",
      imageAlt: "Parlante Dos",
      technicalSpecs: "10 horas de batería",
      unitPrice: "S/ 149.00",
      unitPriceValue: 149,
      wholesalePrice: null,
      wholesalePriceValue: null,
      wholesaleMinQty: 1,
      availabilityLabel: "Disponible",
      stockUnits: 5,
      unitsPerBox: null,
    },
    {
      id: "product-3",
      slug: "parlante-tres",
      code: "PAR-003",
      name: "Parlante Tres",
      description: "Parlante para exteriores.",
      brand: "Super",
      category: "Parlantes",
      imageUrl: "/uploads/products/par-003.webp",
      outboundImageUrl: "https://images.example.test/par-003.jpg",
      imageAlt: "Parlante Tres",
      technicalSpecs: "Resistencia al agua",
      unitPrice: "S/ 199.00",
      unitPriceValue: 199,
      wholesalePrice: null,
      wholesalePriceValue: null,
      wholesaleMinQty: 1,
      availabilityLabel: "Disponible",
      stockUnits: 3,
      unitsPerBox: null,
    },
    {
      id: "product-4",
      slug: "parlante-cuatro",
      code: "PAR-004",
      name: "Parlante Cuatro",
      description: "Parlante de escritorio.",
      brand: "Super",
      category: "Parlantes",
      imageUrl: "/uploads/products/par-004.webp",
      outboundImageUrl: "https://images.example.test/par-004.jpg",
      imageAlt: "Parlante Cuatro",
      technicalSpecs: "Entrada auxiliar",
      unitPrice: "S/ 249.00",
      unitPriceValue: 249,
      wholesalePrice: null,
      wholesalePriceValue: null,
      wholesaleMinQty: 1,
      availabilityLabel: "Disponible",
      stockUnits: 2,
      unitsPerBox: null,
    },
  ],
  document: {
    deliveryKey: "catalog:parlantes.pdf",
    filename: "parlantes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1_024,
    url: "https://tiendavirtualsuper.com/uploads/catalogs/parlantes.pdf",
  },
};

function completedResponse(draft: unknown) {
  return Response.json({
    status: "completed",
    output_text: JSON.stringify(draft),
  });
}

test("keeps the verified reply when live AI is disabled", async () => {
  let calls = 0;
  const result = await composeLiveSuperBotReply(
    { message: "Busco parlantes", verifiedReply },
    {
      enabled: false,
      apiKey: "test-key",
      fetchImpl: (async () => {
        calls += 1;
        return completedResponse({ language: "es-PE", text: "No se usa.", productCodes: [] });
      }) as typeof fetch,
    },
  );

  assert.equal(calls, 0);
  assert.equal(result, verifiedReply);
});

test("uses Responses with verified facts and only returns selected verified products", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await composeLiveSuperBotReply(
    {
      message: "Hola, quiero un parlante",
      recentMessages: [{ role: "user", text: "Necesito uno pequeño" }],
      isFirstContact: true,
      verifiedReply,
    },
    {
      enabled: true,
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(url);
        requestInit = init;
        return completedResponse({
          language: "es-PE",
          text: "Te comparto dos opciones que podrían servirte.",
          productCodes: ["PAR-002", "PAR-001"],
        });
      }) as typeof fetch,
    },
  );

  assert.equal(requestUrl, "https://api.openai.com/v1/responses");
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Bearer test-key");
  assert.equal(result.text, "¡Hola! Soy Super Bot de Importaciones Super. Te comparto dos opciones que podrían servirte.");
  assert.deepEqual(result.products?.map((product) => product.code), ["PAR-002", "PAR-001"]);
  assert.equal(result.document?.url, verifiedReply.document?.url);

  const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
  assert.equal(body.model, "test-model");
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: "low" });
  const format = (body.text as { format: { type: string; schema: { properties: Record<string, unknown> } } }).format;
  assert.equal(format.type, "json_schema");
  assert.deepEqual(format.schema.properties.productCodes, {
    type: "array",
    maxItems: 3,
    items: { type: "string", minLength: 1, maxLength: 64 },
  });
  assert.match(String(body.instructions), /No te presentes ni saludes/);
  assert.match(String(body.instructions), /No inventes/);
  assert.match(String(body.instructions), /No incluyas URL/);
  assert.match(String(body.input), /PAR-001/);
  assert.doesNotMatch(String(body.input), /outboundImageUrl/);
});

test("uses the default model and does not add an introduction outside first contact", async () => {
  let body: Record<string, unknown> | undefined;
  const result = await composeLiveSuperBotReply(
    { message: "Busco parlantes", isFirstContact: false, verifiedReply },
    {
      enabled: true,
      apiKey: "test-key",
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return completedResponse({
          language: "es-PE",
          text: "Te muestro las opciones disponibles.",
          productCodes: [],
        });
      }) as typeof fetch,
    },
  );

  assert.equal(body?.model, DEFAULT_SUPER_BOT_LIVE_MODEL);
  assert.equal(result.text, "Te muestro las opciones disponibles.");
  assert.deepEqual(result.products?.map((product) => product.code), ["PAR-001", "PAR-002", "PAR-003"]);
});

test("falls back unchanged when the model selects an unknown product or emits a URL", async () => {
  const unknownProduct = await composeLiveSuperBotReply(
    { message: "Busco parlantes", verifiedReply },
    {
      enabled: true,
      apiKey: "test-key",
      fetchImpl: (async () => completedResponse({
        language: "es-PE",
        text: "Te comparto una opción.",
        productCodes: ["OTRO-999"],
      })) as typeof fetch,
    },
  );
  assert.equal(unknownProduct, verifiedReply);

  const generatedUrl = await composeLiveSuperBotReply(
    { message: "Busco parlantes", verifiedReply },
    {
      enabled: true,
      apiKey: "test-key",
      fetchImpl: (async () => completedResponse({
        language: "es-PE",
        text: "Mira https://ejemplo.test/oferta",
        productCodes: ["PAR-001"],
      })) as typeof fetch,
    },
  );
  assert.equal(generatedUrl, verifiedReply);

  const inventedPrice = await composeLiveSuperBotReply(
    { message: "Busco parlantes", verifiedReply },
    {
      enabled: true,
      apiKey: "test-key",
      fetchImpl: (async () => completedResponse({
        language: "es-PE",
        text: "Esta opción cuesta S/ 1.00.",
        productCodes: ["PAR-001"],
      })) as typeof fetch,
    },
  );
  assert.equal(inventedPrice, verifiedReply);
});

test("falls back unchanged when no API key is configured or the request times out", async () => {
  let calls = 0;
  const missingKey = await composeLiveSuperBotReply(
    { message: "Busco parlantes", verifiedReply },
    {
      enabled: true,
      apiKey: "",
      fetchImpl: (async () => {
        calls += 1;
        return completedResponse({ language: "es-PE", text: "No se usa.", productCodes: [] });
      }) as typeof fetch,
    },
  );
  assert.equal(calls, 0);
  assert.equal(missingKey, verifiedReply);

  let aborted = false;
  const timeout = await composeLiveSuperBotReply(
    { message: "Busco parlantes", verifiedReply },
    {
      enabled: true,
      apiKey: "test-key",
      timeoutMs: 5,
      fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      })) as typeof fetch,
    },
  );
  assert.equal(aborted, true);
  assert.equal(timeout, verifiedReply);
});
