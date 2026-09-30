import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findCatalogProductIds, matchesProductQuery } from "./rocky-product-query";
import { getPreferredProductImageUrl } from "@/lib/product-media";
import {
  buildProductSearchWhere,
  getSuggestionScore,
} from "@/lib/store-shared";

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 20;
const MAX_SEARCH_QUERY_LENGTH = 120;
const MAX_SEARCH_CANDIDATES = 120;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const normalizedQuery = z.preprocess(
  (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value),
  z.string().min(1).max(MAX_SEARCH_QUERY_LENGTH),
);

export const internalProductSearchSchema = z.object({
  query: normalizedQuery,
  limit: z.coerce.number().int().positive().max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
});

export type InternalProductSearchInput = z.infer<typeof internalProductSearchSchema>;

export type InternalProductSearchProduct = {
  id: string;
  code: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  technicalSpecs: string | null;
  unitPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number;
  boxPrice: number | null;
  unitsPerBox: number | null;
  stockUnits: number;
  imageUrl: string | null;
  url: string;
};

export type InternalProductSearchResponse = {
  query: string;
  count: number;
  products: InternalProductSearchProduct[];
};

const INTERNAL_PRODUCT_SEARCH_SELECT = {
  id: true,
  code: true,
  slug: true,
  name: true,
  brand: true,
  category: true,
  description: true,
  technicalSpecs: true,
  externalCode: true,
  externalId: true,
  imageUrl: true,
  sourceImageUrl: true,
  localImageUrl: true,
  media: {
    orderBy: { sortOrder: "asc" },
    take: 4,
    select: {
      url: true,
    },
  },
  unitPrice: true,
  wholesalePrice: true,
  wholesaleMinQty: true,
  boxPrice: true,
  unitsPerBox: true,
  stockUnits: true,
  isVisible: true,
  isFeatured: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

export type InternalProductSearchRow = Prisma.ProductGetPayload<{
  select: typeof INTERNAL_PRODUCT_SEARCH_SELECT;
}>;

type ProductSearchRepository = {
  findMany: typeof prisma.product.findMany;
};

type SearchInternalProductsOptions = {
  repository?: ProductSearchRepository;
  siteUrl?: string;
};

type InternalProductSearchHandlerOptions = SearchInternalProductsOptions & {
  internalApiKey?: string;
  searchProducts?: (
    input: InternalProductSearchInput,
    options?: SearchInternalProductsOptions,
  ) => Promise<InternalProductSearchProduct[]>;
};

function normalizeSiteUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "https://tiendavirtualsuper.com";
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return "https://tiendavirtualsuper.com";
  }
}

function getRequestSiteUrl(request: Request) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  return new URL(request.url).origin;
}

function numberOrNull(value: Prisma.Decimal | number | null) {
  return value === null ? null : Number(value);
}

function buildProductUrl(siteUrl: string, slug: string) {
  return new URL(`/producto/${slug}`, normalizeSiteUrl(siteUrl)).toString();
}

function buildExactIdentifierWhere(query: string): Prisma.ProductWhereInput {
  return {
    OR: [
      { code: { equals: query, mode: "insensitive" } },
      { externalCode: { equals: query, mode: "insensitive" } },
      { externalId: { equals: query, mode: "insensitive" } },
      { slug: { equals: query, mode: "insensitive" } },
    ],
  };
}

export function buildInternalProductSearchWhere(query: string): Prisma.ProductWhereInput {
  const searchWhere = buildProductSearchWhere(query);

  return {
    AND: [
      { isVisible: true },
      searchWhere ?? {},
    ],
  };
}

function getSearchTake(limit: number) {
  return Math.max(MAX_SEARCH_LIMIT * 3, Math.min(MAX_SEARCH_CANDIDATES, limit * 8));
}

function getResultScore(product: InternalProductSearchRow, query: string) {
  return getSuggestionScore(product, query);
}

function mergeUniqueProducts(productGroups: InternalProductSearchRow[][]) {
  const products = new Map<string, InternalProductSearchRow>();

  for (const group of productGroups) {
    for (const product of group) {
      products.set(product.id, product);
    }
  }

  return Array.from(products.values());
}

export function rankAndMapInternalProductResults(input: {
  products: InternalProductSearchRow[];
  query: string;
  limit: number;
  siteUrl?: string;
}) {
  const siteUrl = normalizeSiteUrl(input.siteUrl);

  return input.products
    .filter((product) => product.isVisible && product.stockUnits > 0 && Number(product.unitPrice) > 0 && matchesProductQuery(product, input.query))
    .map((product) => ({
      product,
      score: getResultScore(product, input.query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const stockDelta = Number(right.product.stockUnits > 0) - Number(left.product.stockUnits > 0);

      if (stockDelta !== 0) {
        return stockDelta;
      }

      const featuredDelta = Number(right.product.isFeatured) - Number(left.product.isFeatured);

      if (featuredDelta !== 0) {
        return featuredDelta;
      }

      const stockUnitsDelta = right.product.stockUnits - left.product.stockUnits;

      if (stockUnitsDelta !== 0) {
        return stockUnitsDelta;
      }

      return right.product.updatedAt.getTime() - left.product.updatedAt.getTime();
    })
    .slice(0, input.limit)
    .map(({ product }) => ({
      id: product.id,
      code: product.code,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
      technicalSpecs: product.technicalSpecs,
      unitPrice: Number(product.unitPrice),
      wholesalePrice: numberOrNull(product.wholesalePrice),
      wholesaleMinQty: product.wholesaleMinQty,
      boxPrice: numberOrNull(product.boxPrice),
      unitsPerBox: product.unitsPerBox,
      stockUnits: product.stockUnits,
      imageUrl: getPreferredProductImageUrl({
        localImageUrl: product.localImageUrl,
        imageUrl: product.sourceImageUrl ?? product.imageUrl,
        media: product.media,
      }),
      url: buildProductUrl(siteUrl, product.slug),
    }));
}

export async function searchInternalProducts(
  input: InternalProductSearchInput,
  options: SearchInternalProductsOptions = {},
) {
  const repository = options.repository ?? prisma.product;
  if (!options.repository) {
    const ids = await findCatalogProductIds(input.query, MAX_SEARCH_CANDIDATES);
    const products = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, select: INTERNAL_PRODUCT_SEARCH_SELECT }) : [];
    return rankAndMapInternalProductResults({ products, query: input.query, limit: input.limit, siteUrl: options.siteUrl });
  }
  const [exactMatches, searchMatches] = await Promise.all([
    repository.findMany({
      where: {
        AND: [
          { isVisible: true },
          buildExactIdentifierWhere(input.query),
        ],
      },
      orderBy: [
        { stockUnits: "desc" },
        { updatedAt: "desc" },
        { id: "asc" },
      ],
      take: input.limit,
      select: INTERNAL_PRODUCT_SEARCH_SELECT,
    }),
    repository.findMany({
      where: buildInternalProductSearchWhere(input.query),
      orderBy: [
        { isFeatured: "desc" },
        { stockUnits: "desc" },
        { updatedAt: "desc" },
        { id: "asc" },
      ],
      take: getSearchTake(input.limit),
      select: INTERNAL_PRODUCT_SEARCH_SELECT,
    }),
  ]);

  return rankAndMapInternalProductResults({
    products: mergeUniqueProducts([exactMatches, searchMatches]),
    query: input.query,
    limit: input.limit,
    siteUrl: options.siteUrl,
  });
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
}

function invalidPayloadResponse(error: z.ZodError | null = null) {
  return NextResponse.json(
    {
      error: "Invalid request payload",
      ...(error ? { details: error.issues } : {}),
    },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

export async function handleInternalProductSearchRequest(
  request: Request,
  options: InternalProductSearchHandlerOptions = {},
) {
  try {
    const internalApiKey = options.internalApiKey ?? process.env.N8N_INTERNAL_API_KEY;

    if (!internalApiKey) {
      console.error("N8N_INTERNAL_API_KEY is not configured.");
      return NextResponse.json(
        { error: "Internal server configuration error" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const providedKey = request.headers.get("x-internal-api-key");
    if (!providedKey || providedKey !== internalApiKey) {
      return unauthorizedResponse();
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return invalidPayloadResponse();
    }

    const parsedInput = internalProductSearchSchema.parse(payload);
    const searchProducts = options.searchProducts ?? searchInternalProducts;
    const products = await searchProducts(parsedInput, {
      repository: options.repository,
      siteUrl: options.siteUrl ?? getRequestSiteUrl(request),
    });
    const response: InternalProductSearchResponse = {
      query: parsedInput.query,
      count: products.length,
      products,
    };

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return invalidPayloadResponse(error);
    }

    console.error("Error searching internal products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
