import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  matchSimulatorProductImage,
  parseSimulatorImageDataUrl,
  SIMULATOR_IMAGE_MAX_BYTES,
  simulatorImageMatchFallbackText,
} from "./super-bot-simulator-image-match";

const tinyPng = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString("base64")}`;

const candidate = {
  id: "p-jbl-speaker", slug: "jbl-go-4", code: "JBL-GO4", externalCode: null, externalId: null,
  name: "Parlante JBL GO 4", description: null, technicalSpecs: null, brand: "JBL", category: "Parlantes",
  categoryId: null, imageUrl: "/uploads/products/jbl.webp", sourceImageUrl: null, localImageUrl: null,
  unitPrice: 199, wholesalePrice: null, wholesaleMinQty: 1, boxPrice: null, unitsPerBox: null,
  stockUnits: 8, isVisible: true, media: [],
};

function response(value: object) {
  return Response.json({ status: "completed", output_text: JSON.stringify(value) });
}

test("valida MIME, firma y límite de una captura antes de llamar al modelo", () => {
  assert.ok(parseSimulatorImageDataUrl(tinyPng));
  assert.equal(parseSimulatorImageDataUrl("data:image/jpeg;base64,AAAA"), null);
  assert.equal(parseSimulatorImageDataUrl(`data:image/png;base64,${Buffer.alloc(SIMULATOR_IMAGE_MAX_BYTES + 1).toString("base64")}`), null);
});

test("solo acepta el ID que el modelo escogió dentro de candidatos del catálogo", async () => {
  const requests: RequestInit[] = [];
  const result = await matchSimulatorProductImage(tinyPng, {
    enabled: true,
    apiKey: "test-key",
    findVisualCandidates: async () => [],
    findCandidates: async (signals) => {
      assert.deepEqual(signals.codes, ["JBL-GO4"]);
      return [candidate];
    },
    getCurrencySymbol: async () => "S/",
    fetchImpl: (async (_url, init) => {
      requests.push(init!);
      return requests.length === 1
        ? response({ codes: ["JBL-GO4"], searchTerms: ["parlante jbl"] })
        : response({ productId: "p-jbl-speaker", confidence: 0.93 });
    }) as typeof fetch,
  });

  assert.equal(result.status, "matched");
  assert.equal(result.product?.code, "JBL-GO4");
  assert.equal(result.product?.unitPrice, "S/ 199.00");
  assert.equal(result.productIsSellable, true);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const body = JSON.parse(String(request.body));
    assert.equal(body.store, false);
    assert.match(JSON.stringify(body.input), /input_image/);
  }
});

test("una coincidencia de baja confianza no entrega una tarjeta", async () => {
  let calls = 0;
  const result = await matchSimulatorProductImage(tinyPng, {
    enabled: true,
    apiKey: "test-key",
    findVisualCandidates: async () => [],
    findCandidates: async () => [candidate],
    fetchImpl: (async () => response(++calls === 1
      ? { codes: ["JBL-GO4"], searchTerms: ["parlante"] }
      : { productId: "producto-inventado", confidence: 0.98 })) as typeof fetch,
  });

  assert.equal(result.status, "unmatched");
  assert.equal(result.reason, "low_confidence");
  assert.equal(result.product, undefined);
  const fallback = simulatorImageMatchFallbackText(result.status);
  assert.match(fallback, /otra foto|otra vista|tipo, color o tamaño/i);
  assert.doesNotMatch(fallback, /código|codigo/i);
});

test("una coincidencia visual clara evita depender de OCR o del proveedor", async () => {
  const bytes = await sharp({
    create: { width: 18, height: 12, channels: 3, background: "white" },
  })
    .composite([{ input: Buffer.from('<svg width="18" height="12"><rect x="0" y="0" width="9" height="12" fill="black" /></svg>') }])
    .png()
    .toBuffer();
  const imageDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  let providerCalls = 0;

  const result = await matchSimulatorProductImage(imageDataUrl, {
    enabled: false,
    // A screenshot or a recompressed download can differ from the source
    // artwork by a few dHash bits. The gap to the next candidate keeps this
    // grounded match safe.
    findVisualCandidates: async () => [
      { candidate, distance: 7 },
      { candidate: { ...candidate, id: "second-product" }, distance: 11 },
    ],
    fetchImpl: (async () => {
      providerCalls += 1;
      return Response.json({});
    }) as typeof fetch,
    getCurrencySymbol: async () => "S/",
  });

  assert.equal(result.status, "matched");
  assert.equal(result.product?.code, "JBL-GO4");
  assert.equal(result.productIsSellable, true);
  assert.equal(result.confidence, 0.89);
  assert.equal(providerCalls, 0);
});
