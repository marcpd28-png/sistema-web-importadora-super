import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  handleInternalProductSearchRequest,
  rankAndMapInternalProductResults,
  type InternalProductSearchProduct,
  type InternalProductSearchRow,
} from "@/lib/internal-product-search";

const SITE_URL = "https://tiendavirtualsuper.com";

function productFixture(overrides: Partial<InternalProductSearchRow> = {}): InternalProductSearchRow {
  return {
    id: "product-1",
    code: "BASE-1",
    slug: "producto-base",
    name: "Producto base",
    brand: "Generico",
    category: "VARIOS",
    description: null,
    technicalSpecs: null,
    externalCode: null,
    externalId: null,
    imageUrl: null,
    sourceImageUrl: null,
    localImageUrl: null,
    media: [],
    unitPrice: new Prisma.Decimal("100.00"),
    wholesalePrice: new Prisma.Decimal("90.00"),
    wholesaleMinQty: 3,
    boxPrice: null,
    unitsPerBox: null,
    stockUnits: 10,
    isVisible: true,
    isFeatured: false,
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

function searchFixtures(query: string, products: InternalProductSearchRow[], limit = 10) {
  return rankAndMapInternalProductResults({
    products,
    query,
    limit,
    siteUrl: SITE_URL,
  });
}

function request(body: unknown, apiKey?: string) {
  return new Request(`${SITE_URL}/api/internal/products/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-internal-api-key": apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function jsonResponse(response: Response) {
  return response.json() as Promise<{
    error?: string;
    count?: number;
    products?: InternalProductSearchProduct[];
    query?: string;
  }>;
}

test("rechaza requests sin API key", async () => {
  const response = await handleInternalProductSearchRequest(request({ query: "jbl" }), {
    internalApiKey: "secret",
    searchProducts: async () => {
      throw new Error("search should not be called");
    },
  });

  assert.equal(response.status, 401);
  assert.equal((await jsonResponse(response)).error, "Unauthorized");
});

test("rechaza requests con API key incorrecta", async () => {
  const response = await handleInternalProductSearchRequest(request({ query: "jbl" }, "wrong"), {
    internalApiKey: "secret",
    searchProducts: async () => {
      throw new Error("search should not be called");
    },
  });

  assert.equal(response.status, 401);
  assert.equal((await jsonResponse(response)).error, "Unauthorized");
});

test("rechaza query inválida", async () => {
  const response = await handleInternalProductSearchRequest(request({ query: "   " }, "secret"), {
    internalApiKey: "secret",
    searchProducts: async () => [],
  });

  assert.equal(response.status, 400);
  assert.equal((await jsonResponse(response)).error, "Invalid request payload");
});

test("busca productos por nombre", () => {
  const products = searchFixtures("parlante jbl", [
    productFixture({
      id: "speaker",
      code: "JBL-100",
      slug: "parlante-jbl",
      name: "Parlante JBL Charge",
    }),
  ]);

  assert.equal(products.length, 1);
  assert.equal(products[0].code, "JBL-100");
});

test("busca productos por código", () => {
  const products = searchFixtures("SKU-123", [
    productFixture({
      id: "speaker",
      code: "SKU-123",
      slug: "speaker-sku-123",
      name: "Parlante portatil",
      stockUnits: 5,
    }),
    productFixture({
      id: "brand-match",
      code: "OTHER-1",
      slug: "otro-producto",
      name: "Producto con marca",
      brand: "SKU-123",
      stockUnits: 50,
    }),
  ]);

  assert.equal(products[0].code, "SKU-123");
});

test("busca productos por marca", () => {
  const products = searchFixtures("anker", [
    productFixture({
      id: "charger",
      code: "CHG-1",
      slug: "cargador-anker",
      name: "Cargador rapido",
      brand: "Anker",
    }),
  ]);

  assert.equal(products.length, 1);
  assert.equal(products[0].brand, "Anker");
});

test("busca productos por categoría", () => {
  const products = searchFixtures("audifonos", [
    productFixture({
      id: "headphones",
      code: "AUD-1",
      slug: "audifonos-bluetooth",
      name: "Bluetooth TWS",
      category: "AUDIFONOS",
    }),
  ]);

  assert.equal(products.length, 1);
  assert.equal(products[0].category, "AUDIFONOS");
});

test("devuelve lista vacía cuando no hay resultados relevantes", () => {
  const products = searchFixtures("consulta inexistente", [
    productFixture({
      id: "speaker",
      code: "JBL-100",
      slug: "parlante-jbl",
      name: "Parlante JBL",
    }),
  ]);

  assert.deepEqual(products, []);
});

test("respeta el limit solicitado", () => {
  const products = searchFixtures(
    "parlante",
    [
      productFixture({ id: "speaker-1", code: "SPK-1", slug: "parlante-1", name: "Parlante 1" }),
      productFixture({ id: "speaker-2", code: "SPK-2", slug: "parlante-2", name: "Parlante 2" }),
      productFixture({ id: "speaker-3", code: "SPK-3", slug: "parlante-3", name: "Parlante 3" }),
    ],
    2,
  );

  assert.equal(products.length, 2);
});

test("no devuelve productos invisibles", () => {
  const products = searchFixtures("parlante", [
    productFixture({
      id: "hidden",
      code: "HID-1",
      slug: "parlante-oculto",
      name: "Parlante oculto",
      isVisible: false,
    }),
  ]);

  assert.deepEqual(products, []);
});

test("serializa precios Decimal como números JSON", async () => {
  const response = await handleInternalProductSearchRequest(request({ query: "parlante" }, "secret"), {
    internalApiKey: "secret",
    siteUrl: SITE_URL,
    searchProducts: async () =>
      searchFixtures("parlante", [
        productFixture({
          id: "speaker",
          code: "SPK-1",
          slug: "parlante",
          name: "Parlante",
          unitPrice: new Prisma.Decimal("100.50"),
          wholesalePrice: new Prisma.Decimal("90.25"),
          boxPrice: new Prisma.Decimal("500.75"),
        }),
      ]),
  });
  const body = await jsonResponse(response);

  assert.equal(response.status, 200);
  assert.equal(body.count, 1);
  assert.equal(typeof body.products?.[0]?.unitPrice, "number");
  assert.equal(body.products?.[0]?.unitPrice, 100.5);
  assert.equal(typeof body.products?.[0]?.wholesalePrice, "number");
  assert.equal(body.products?.[0]?.wholesalePrice, 90.25);
  assert.equal(typeof body.products?.[0]?.boxPrice, "number");
  assert.equal(body.products?.[0]?.boxPrice, 500.75);
});
