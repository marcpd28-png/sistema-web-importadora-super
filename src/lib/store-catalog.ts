import { getErpBestSellerSnapshot } from "@/lib/erp-sales";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BLOCKED_PUBLIC_PRODUCT_CODES } from "@/lib/public-product-blocklist";
import {
  GENERIC_PRODUCT_PHOTO_URLS,
  PUBLIC_PAGE_SIZE,
  buildWhere,
  buildRealProductPhotoWhere,
  buildSellableProductWhere,
  getProductSearchTerms,
  getProductSearchTokenGroups,
  getHeroBannerViews,
  getStoreSettings,
  mapCategory,
  mapProduct,
} from "@/lib/store-shared";
import type {
  BrandOption,
  CatalogCategorySection,
  CatalogSalesSummary,
  CatalogSuggestion,
} from "@/lib/store-types";

type CatalogSearchDestination =
  | { href: string; kind: "product" }
  | { href: string; kind: "category" }
  | { href: string; kind: "collection" }
  | { href: string; kind: "brand" };

const COLLECTION_SEARCH_ALIASES: Array<{
  href: string;
  terms: string[];
}> = [
  { href: "/?collection=proyectores", terms: ["proyector", "proyectores", "projector", "projectors"] },
  { href: "/?collection=drones", terms: ["dron", "drones"] },
  { href: "/?collection=alexas", terms: ["alexa", "alexas", "echo"] },
  {
    href: "/?collection=consolas",
    terms: ["consola", "consolas", "videojuego", "videojuegos", "game stick", "gamestick"],
  },
];

const EMPTY_SALES_SUMMARY: CatalogSalesSummary = {
  generatedAt: null,
  hasDatedSales: false,
  hasRealSales: false,
  hasUnitSales: false,
  insights: [
    { label: "15 días", value: "Sin ventas ERP" },
    { label: "Rotación", value: "Sin unidades" },
  ],
  source: "fallback",
};

const CATALOG_SUGGESTION_LIMIT = 6;
const CATALOG_SUGGESTION_MAX_QUERY_LENGTH = 80;
const CATALOG_SUGGESTION_MAX_TOKENS = 4;

type CatalogSuggestionRow = {
  id: string;
  slug: string;
  code: string;
  name: string;
  brand: string | null;
  category: string | null;
};

export async function getCatalogPageData(input: {
  query?: string;
  category?: string;
  brand?: string;
  page?: number;
  featuredOnly?: boolean;
  collection?: string;
  sort?: string;
}) {
  const page = Math.max(1, input.page ?? 1);
  const collection = input.collection?.trim().toLowerCase() ?? "";
  const needsBestSellerSnapshot = shouldLoadBestSellerSnapshot(input, page, collection);
  const bestSellerSnapshot = needsBestSellerSnapshot
    ? await getErpBestSellerSnapshot(PUBLIC_PAGE_SIZE * 8)
    : {
        codes: [],
        summary: EMPTY_SALES_SUMMARY,
      };
  const bestSellerCodes = bestSellerSnapshot.codes;
  const shouldRankBestSellers = collection === "mas-vendidos" && bestSellerCodes.length > 0;
  const where = buildCatalogWhere(input, shouldRankBestSellers ? bestSellerCodes : []);
  const [queriedProducts, bestSellerRows, totalResults, categoryRows, brandRows, visibleCount, featuredCount, settings, heroBanners, homeCategorySections] =
    await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          media: {
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy:
          collection === "mas-vendidos"
            ? [{ updatedAt: "desc" as const }, { id: "desc" as const }]
            : getCatalogOrderBy(input.sort),
        skip: shouldRankBestSellers ? undefined : (page - 1) * PUBLIC_PAGE_SIZE,
        take: shouldRankBestSellers ? undefined : PUBLIC_PAGE_SIZE,
      }),
      bestSellerCodes.length
        ? prisma.product.findMany({
            where: buildBestSellerProductsWhere(bestSellerCodes),
            include: {
              media: {
                orderBy: { sortOrder: "asc" },
              },
            },
          })
        : [],
      prisma.product.count({ where }),
      prisma.category.findMany({
        where: {
          products: {
            some: {
              AND: [buildSellableProductWhere()],
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: {
          ...buildSellableProductWhere(),
          brand: { not: null },
        },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
        select: { brand: true },
      }),
      prisma.product.count({ where: buildSellableProductWhere() }),
      prisma.product.count({
        where: { AND: [buildSellableProductWhere(), { isFeatured: true }] },
      }),
      getStoreSettings(),
      getHeroBannerViews({ slot: "HERO" }),
      buildHomeCategorySections({
        isHomeView:
          page === 1 &&
          !input.query?.trim() &&
          (input.category?.trim() || "all") === "all" &&
          (input.brand?.trim() || "all") === "all" &&
          !collection &&
          !input.featuredOnly,
      }),
    ]);
  const orderedProducts =
    shouldRankBestSellers ? rankProductsByCode(queriedProducts, bestSellerCodes) : queriedProducts;
  const products = shouldRankBestSellers
    ? orderedProducts.slice((page - 1) * PUBLIC_PAGE_SIZE, page * PUBLIC_PAGE_SIZE)
    : orderedProducts;
  const bestSellerProducts = bestSellerCodes.length
    ? rankProductsByCode(bestSellerRows, bestSellerCodes)
        .slice(0, 12)
        .map(mapProduct)
    : [];

  return {
    bestSellerProducts,
    products: products.map(mapProduct),
    salesSummary: bestSellerSnapshot.summary,
    totalResults,
    totalPages: Math.max(1, Math.ceil(totalResults / PUBLIC_PAGE_SIZE)),
    page,
    featuredOnly: Boolean(input.featuredOnly),
    selectedBrand: input.brand?.trim() || "all",
    selectedSort: input.sort?.trim() || "featured",
    categories: categoryRows.map(mapCategory),
    brands: brandRows
      .map((item) => item.brand?.trim())
      .filter((value): value is string => Boolean(value))
      .map((name) => ({ name })) satisfies BrandOption[],
    stats: {
      visibleCount,
      featuredCount,
    },
    settings,
    heroBanners,
    homeCategorySections,
  };
}

export async function getExactCatalogProductSlug(query: string) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return null;
  }

  const normalizedQuery = normalizeCatalogSearchText(trimmedQuery);
  const compactQuery = compactCatalogSearchText(trimmedQuery);
  const searchConditions: Prisma.ProductWhereInput[] = [
    { code: { equals: trimmedQuery, mode: "insensitive" } },
    { externalCode: { equals: trimmedQuery, mode: "insensitive" } },
    { externalId: { equals: trimmedQuery, mode: "insensitive" } },
    { slug: { equals: trimmedQuery, mode: "insensitive" } },
    { name: { equals: trimmedQuery, mode: "insensitive" } },
    { code: { contains: trimmedQuery, mode: "insensitive" } },
    { externalCode: { contains: trimmedQuery, mode: "insensitive" } },
    { externalId: { contains: trimmedQuery, mode: "insensitive" } },
    { slug: { contains: trimmedQuery, mode: "insensitive" } },
    { name: { contains: trimmedQuery, mode: "insensitive" } },
  ];

  if (compactQuery) {
    searchConditions.push(
      { code: { contains: compactQuery, mode: "insensitive" } },
      { externalCode: { contains: compactQuery, mode: "insensitive" } },
      { externalId: { contains: compactQuery, mode: "insensitive" } },
      { slug: { contains: compactQuery, mode: "insensitive" } },
    );
  }

  const candidates = await prisma.product.findMany({
    where: {
      NOT: {
        code: { in: BLOCKED_PUBLIC_PRODUCT_CODES },
      },
      isVisible: true,
      OR: searchConditions,
    },
    select: {
      slug: true,
      code: true,
      externalCode: true,
      externalId: true,
      name: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 20,
  });

  if (!candidates.length) {
    return null;
  }

  const scoredCandidates = candidates
    .map((product) => {
      const values = [product.code, product.externalCode, product.externalId, product.slug, product.name]
        .filter((value): value is string => Boolean(value))
        .map((value) => ({
          raw: value,
          normalized: normalizeCatalogSearchText(value),
          compact: compactCatalogSearchText(value),
        }));

      let score = 0;

      for (const value of values) {
        if (normalizedQuery && value.normalized === normalizedQuery) {
          score = Math.max(score, value.raw === product.code ? 100 : 95);
        }

        if (compactQuery && value.compact === compactQuery) {
          score = Math.max(score, value.raw === product.code ? 100 : 95);
        }

        if (normalizedQuery && value.normalized.startsWith(normalizedQuery)) {
          score = Math.max(score, value.raw === product.code ? 85 : 78);
        }

        if (compactQuery && value.compact.startsWith(compactQuery)) {
          score = Math.max(score, value.raw === product.code ? 85 : 78);
        }

        if (normalizedQuery && value.normalized.includes(normalizedQuery)) {
          score = Math.max(score, value.raw === product.code ? 72 : 64);
        }

        if (compactQuery && value.compact.includes(compactQuery)) {
          score = Math.max(score, value.raw === product.code ? 72 : 64);
        }
      }

      return { product, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scoredCandidates.length) {
    return null;
  }

  if (scoredCandidates.length > 1) {
    return null;
  }

  const topScore = scoredCandidates[0].score;
  const topCandidates = scoredCandidates.filter((item) => item.score === topScore);

  if (topCandidates.length > 1) {
    return null;
  }

  return scoredCandidates[0]?.product.slug ?? null;
}

export async function getCatalogSearchDestination(query: string): Promise<CatalogSearchDestination | null> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return null;
  }

  const normalizedQuery = normalizeCatalogSearchText(trimmedQuery);
  const singularQuery = singularizeCatalogSearchText(normalizedQuery);

  const brandMatch = await getBrandSearchDestination(trimmedQuery);
  if (brandMatch) {
    return brandMatch;
  }

  const exactProductSlug = await getExactCatalogProductSlug(trimmedQuery);
  if (exactProductSlug) {
    return { href: `/producto/${exactProductSlug}`, kind: "product" };
  }

  const categories = await prisma.category.findMany({
    select: { name: true, slug: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const categoryMatch = categories.find((category) => {
    const normalizedName = normalizeCatalogSearchText(category.name);
    const normalizedSlug = normalizeCatalogSearchText(category.slug);
    const singularName = singularizeCatalogSearchText(normalizedName);
    const singularSlug = singularizeCatalogSearchText(normalizedSlug);

    return (
      normalizedQuery === normalizedName ||
      normalizedQuery === normalizedSlug ||
      singularQuery === normalizedName ||
      singularQuery === normalizedSlug ||
      normalizedQuery.includes(normalizedName) ||
      normalizedName.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedSlug) ||
      normalizedSlug.includes(normalizedQuery) ||
      singularQuery === singularName ||
      singularQuery === singularSlug ||
      singularQuery.includes(singularName) ||
      singularQuery.includes(singularSlug)
    );
  });

  if (categoryMatch) {
    return { href: `/categoria/${categoryMatch.slug}`, kind: "category" };
  }

  const collectionMatch = COLLECTION_SEARCH_ALIASES.find((collection) =>
    collection.terms.some((term) => {
      const normalizedTerm = normalizeCatalogSearchText(term);
      const singularTerm = singularizeCatalogSearchText(normalizedTerm);

      return (
        normalizedQuery === normalizedTerm ||
        singularQuery === normalizedTerm ||
        normalizedQuery === singularTerm ||
        singularQuery === singularTerm ||
        normalizedQuery.includes(normalizedTerm) ||
        normalizedTerm.includes(normalizedQuery) ||
        singularQuery.includes(normalizedTerm) ||
        normalizedTerm.includes(singularQuery)
      );
    }),
  );

  if (collectionMatch) {
    return { href: collectionMatch.href, kind: "collection" };
  }

  return null;
}

async function getBrandSearchDestination(
  query: string,
): Promise<{ href: string; kind: "brand" } | null> {
  const normalizedQuery = normalizeCatalogSearchText(query);
  const compactQuery = compactCatalogSearchText(query);

  if (!normalizedQuery && !compactQuery) {
    return null;
  }

  const brands = await prisma.product.findMany({
    where: {
      NOT: {
        code: { in: BLOCKED_PUBLIC_PRODUCT_CODES },
      },
      isVisible: true,
      brand: { not: null },
      AND: [buildRealProductPhotoWhere()],
    },
    distinct: ["brand"],
    orderBy: [{ brand: "asc" }, { id: "asc" }],
    select: { brand: true },
  });

  const normalizedMatches = brands
    .map((item) => item.brand?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((brandName) => {
      const normalizedBrand = normalizeCatalogSearchText(brandName);
      const compactBrand = compactCatalogSearchText(brandName);

      return (
        normalizedQuery === normalizedBrand ||
        compactQuery === compactBrand
      );
    });

  if (normalizedMatches.length !== 1) {
    return null;
  }

  return {
    href: `/?brand=${encodeURIComponent(normalizedMatches[0])}`,
    kind: "brand",
  };
}

async function buildHomeCategorySections(input: { isHomeView: boolean }) {
  if (!input.isHomeView) {
    return [] satisfies CatalogCategorySection[];
  }

  const categoriesByCount = await prisma.product.groupBy({
    by: ["categoryId"],
    where: {
      categoryId: { not: null },
      ...buildSellableProductWhere(),
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        categoryId: "desc",
      },
    },
    take: 12,
  });

  const categoryIds = categoriesByCount
    .map((item) => item.categoryId)
    .filter((value): value is string => Boolean(value));

  if (!categoryIds.length) {
    return [] satisfies CatalogCategorySection[];
  }

  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { id: { in: categoryIds } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.product.findMany({
      where: {
        categoryId: { in: categoryIds },
        ...buildSellableProductWhere(),
      },
      include: {
        media: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [
        { isFeatured: "desc" as const },
        { updatedAt: "desc" as const },
        { id: "asc" as const },
      ],
    }),
  ]);

  const productsByCategoryId = new Map<string, typeof products>();
  for (const product of products) {
    if (!product.categoryId) {
      continue;
    }

    const bucket = productsByCategoryId.get(product.categoryId) ?? [];
    bucket.push(product);
    productsByCategoryId.set(product.categoryId, bucket);
  }

  const orderByCount = new Map(categoryIds.map((id, index) => [id, index]));

  return categories
    .map((category) => {
      const categoryProducts = productsByCategoryId.get(category.id) ?? [];
      return {
        category: mapCategory(category),
        productCount: categoryProducts.length,
        products: categoryProducts.slice(0, 8).map(mapProduct),
        sortIndex: orderByCount.get(category.id) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((item) => item.productCount >= 6)
    .sort((left, right) => left.sortIndex - right.sortIndex)
    .slice(0, 12)
    .map((item) => ({
      category: item.category,
      productCount: item.productCount,
      products: item.products,
    }));
}

function shouldLoadBestSellerSnapshot(
  input: {
    query?: string;
    category?: string;
    brand?: string;
    featuredOnly?: boolean;
  },
  page: number,
  collection: string,
) {
  if (collection === "mas-vendidos") {
    return true;
  }

  return (
    page === 1 &&
    !input.query?.trim() &&
    (input.category?.trim() || "all") === "all" &&
    (input.brand?.trim() || "all") === "all" &&
    !collection &&
    !input.featuredOnly
  );
}

function getCatalogOrderBy(sort?: string) {
  switch (sort) {
    case "price-asc":
      return [{ unitPrice: "asc" as const }, { updatedAt: "desc" as const }, { id: "asc" as const }];
    case "price-desc":
      return [{ unitPrice: "desc" as const }, { updatedAt: "desc" as const }, { id: "asc" as const }];
    case "newest":
      return [{ updatedAt: "desc" as const }, { id: "desc" as const }];
    case "featured":
    default:
      return [
        { isFeatured: "desc" as const },
        { updatedAt: "desc" as const },
        { id: "asc" as const },
      ];
  }
}

function buildCatalogWhere(
  input: {
    query?: string;
    category?: string;
    brand?: string;
    collection?: string;
    featuredOnly?: boolean;
  },
  bestSellerCodes: string[],
) {
  const where = buildWhere(input.query, input.category, input.brand, true, input.featuredOnly);
  const collectionWhere = getCollectionWhere(input.collection);
  const conditions: Prisma.ProductWhereInput[] = [where];

  if (collectionWhere) {
    conditions.push(collectionWhere);
  }

  if (bestSellerCodes.length) {
    conditions.push({
      OR: [
        { code: { in: bestSellerCodes } },
        { externalCode: { in: bestSellerCodes } },
        { externalId: { in: bestSellerCodes } },
      ],
    });
  }

  return { AND: conditions };
}

function getCollectionWhere(collection?: string): Prisma.ProductWhereInput | null {
  switch (collection) {
    case "drones":
      return {
        OR: [
          { name: { contains: "dron", mode: "insensitive" } },
          { code: { contains: "dron", mode: "insensitive" } },
          { name: { contains: "dji mini", mode: "insensitive" } },
          { name: { contains: "dji avata", mode: "insensitive" } },
          { name: { contains: "dji neo", mode: "insensitive" } },
        ],
      };
    case "consolas":
      return {
        AND: [
          {
            OR: [
              { name: { contains: "consola", mode: "insensitive" } },
              { name: { contains: "videojuego", mode: "insensitive" } },
              { name: { contains: "video juego", mode: "insensitive" } },
              { name: { contains: "gamestick", mode: "insensitive" } },
              { name: { contains: "game stick", mode: "insensitive" } },
              { name: { contains: "game player", mode: "insensitive" } },
              { name: { contains: "r36s", mode: "insensitive" } },
            ],
          },
          {
            NOT: [
              { name: { contains: "consolador", mode: "insensitive" } },
            ],
          },
        ],
      };
    default:
      return null;
  }
}

function buildBestSellerProductsWhere(bestSellerCodes: string[]) {
  return {
    AND: [
      {
        NOT: {
          code: { in: BLOCKED_PUBLIC_PRODUCT_CODES },
        },
      },
      { isVisible: true },
      buildRealProductPhotoWhere(),
      {
        OR: [
          { code: { in: bestSellerCodes } },
          { externalCode: { in: bestSellerCodes } },
          { externalId: { in: bestSellerCodes } },
        ],
      },
    ],
  };
}

function rankProductsByCode<T extends { code: string; externalCode: string | null; externalId: string | null }>(
  products: T[],
  rankedCodes: string[],
) {
  const rank = new Map(rankedCodes.map((code, index) => [code, index]));

  return products.slice().sort((left, right) => {
    const leftRank = getProductRank(left, rank);
    const rightRank = getProductRank(right, rank);
    return leftRank - rightRank;
  });
}

function getProductRank(
  product: { code: string; externalCode: string | null; externalId: string | null },
  rank: Map<string, number>,
) {
  for (const candidate of [product.code, product.externalCode, product.externalId]) {
    if (!candidate) {
      continue;
    }

    const value = rank.get(candidate);

    if (value !== undefined) {
      return value;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

export async function getCatalogSuggestions(query: string) {
  const trimmedQuery = query.trim().slice(0, CATALOG_SUGGESTION_MAX_QUERY_LENGTH);

  if (trimmedQuery.length < 2) {
    return [] satisfies CatalogSuggestion[];
  }

  const searchTerms = getProductSearchTerms(trimmedQuery);

  if (!searchTerms.length) {
    return [] satisfies CatalogSuggestion[];
  }

  const searchTokenGroups = getProductSearchTokenGroups(trimmedQuery).slice(
    0,
    CATALOG_SUGGESTION_MAX_TOKENS,
  );
  const rows = await prisma.$queryRaw<CatalogSuggestionRow[]>(Prisma.sql`
    SELECT p.id, p.slug, p.code, p.name, p.brand, p.category
    FROM "Product" p
    WHERE p."isVisible" = true
      ${buildBlockedPublicProductCodesSql()}
      AND ${buildSuggestionPhotoSql()}
      AND ${buildSuggestionSearchSql(searchTerms, searchTokenGroups)}
    ORDER BY
      ${buildSuggestionRelevanceSql(searchTerms, searchTokenGroups)} DESC,
      p."isFeatured" DESC,
      p."updatedAt" DESC,
      p.id ASC
    LIMIT ${CATALOG_SUGGESTION_LIMIT}
  `);

  return rows.map((product) => ({
    id: product.id,
    slug: product.slug,
    code: product.code,
    name: product.name,
    brand: product.brand,
    category: product.category,
  }));
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildLikePattern(term: string, match: "exact" | "starts" | "contains") {
  const escapedTerm = escapeLikePattern(term);

  switch (match) {
    case "exact":
      return escapedTerm;
    case "starts":
      return `${escapedTerm}%`;
    case "contains":
    default:
      return `%${escapedTerm}%`;
  }
}

function buildIlikeSql(column: Prisma.Sql, term: string, match: "exact" | "starts" | "contains") {
  return Prisma.sql`${column} ILIKE ${buildLikePattern(term, match)} ESCAPE '\\'`;
}

function buildAnyIlikeSql(
  columns: Prisma.Sql[],
  terms: string[],
  match: "exact" | "starts" | "contains",
) {
  const conditions = terms.flatMap((term) =>
    columns.map((column) => buildIlikeSql(column, term, match)),
  );

  if (!conditions.length) {
    return Prisma.sql`false`;
  }

  return Prisma.sql`(${Prisma.join(conditions, " OR ")})`;
}

function buildTokenSearchSql(tokenGroups: string[][]) {
  if (tokenGroups.length <= 1) {
    return null;
  }

  return Prisma.sql`(${Prisma.join(
    tokenGroups.map((group) => buildAnyIlikeSql(SUGGESTION_SEARCH_COLUMNS, group, "contains")),
    " AND ",
  )})`;
}

function buildSuggestionSearchSql(terms: string[], tokenGroups: string[][]) {
  const searchConditions = [
    buildAnyIlikeSql(SUGGESTION_SEARCH_COLUMNS, terms, "contains"),
    buildTokenSearchSql(tokenGroups),
  ].filter((condition): condition is Prisma.Sql => Boolean(condition));

  return Prisma.sql`(${Prisma.join(searchConditions, " OR ")})`;
}

function buildSuggestionRelevanceSql(terms: string[], tokenGroups: string[][]) {
  return Prisma.sql`
    CASE
      WHEN ${buildAnyIlikeSql(SUGGESTION_CODE_COLUMNS, terms, "exact")} THEN 110
      WHEN ${buildAnyIlikeSql(SUGGESTION_NAME_COLUMNS, terms, "starts")} THEN 100
      WHEN ${buildAnyIlikeSql(SUGGESTION_NAME_COLUMNS, terms, "contains")} THEN 90
      WHEN ${buildAnyIlikeSql(SUGGESTION_BRAND_COLUMNS, terms, "exact")} THEN 86
      WHEN ${buildAnyIlikeSql(SUGGESTION_BRAND_COLUMNS, terms, "starts")} THEN 82
      WHEN ${buildAnyIlikeSql(SUGGESTION_BRAND_COLUMNS, terms, "contains")} THEN 76
      WHEN ${buildAnyIlikeSql(SUGGESTION_CODE_COLUMNS, terms, "starts")} THEN 72
      WHEN ${buildAnyIlikeSql(SUGGESTION_CODE_COLUMNS, terms, "contains")} THEN 68
      WHEN ${buildAnyIlikeSql(SUGGESTION_CATEGORY_COLUMNS, terms, "starts")} THEN 62
      WHEN ${buildAnyIlikeSql(SUGGESTION_CATEGORY_COLUMNS, terms, "contains")} THEN 58
      WHEN ${buildAnyIlikeSql(SUGGESTION_SLUG_COLUMNS, terms, "contains")} THEN 48
      WHEN ${buildTokenSearchSql(tokenGroups) ?? Prisma.sql`false`} THEN 42
      ELSE 0
    END
  `;
}

function buildBlockedPublicProductCodesSql() {
  if (!BLOCKED_PUBLIC_PRODUCT_CODES.length) {
    return Prisma.empty;
  }

  return Prisma.sql`AND p.code NOT IN (${Prisma.join(BLOCKED_PUBLIC_PRODUCT_CODES)})`;
}

function buildSuggestionPhotoSql() {
  const genericPhotoUrls = [...GENERIC_PRODUCT_PHOTO_URLS, ""];

  return Prisma.sql`(
    (
      p."localImageUrl" IS NOT NULL
      AND p."localImageUrl" NOT IN (${Prisma.join(genericPhotoUrls)})
    )
    OR (
      p."imageUrl" IS NOT NULL
      AND p."imageUrl" NOT IN (${Prisma.join(genericPhotoUrls)})
    )
    OR EXISTS (
      SELECT 1
      FROM "ProductMedia" pm
      WHERE pm."productId" = p.id
        AND pm.url NOT IN (${Prisma.join(genericPhotoUrls)})
    )
  )`;
}

const SUGGESTION_NAME_COLUMNS = [Prisma.sql`p.name`];
const SUGGESTION_BRAND_COLUMNS = [Prisma.sql`p.brand`];
const SUGGESTION_CODE_COLUMNS = [
  Prisma.sql`p.code`,
  Prisma.sql`p."externalCode"`,
  Prisma.sql`p."externalId"`,
];
const SUGGESTION_CATEGORY_COLUMNS = [Prisma.sql`p.category`];
const SUGGESTION_SLUG_COLUMNS = [Prisma.sql`p.slug`];
const SUGGESTION_SEARCH_COLUMNS = [
  ...SUGGESTION_NAME_COLUMNS,
  ...SUGGESTION_CODE_COLUMNS,
  ...SUGGESTION_BRAND_COLUMNS,
  ...SUGGESTION_CATEGORY_COLUMNS,
  ...SUGGESTION_SLUG_COLUMNS,
];

function normalizeCatalogSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singularizeCatalogSearchText(value: string) {
  return value
    .split(" ")
    .map((token) => {
      if (token.length <= 3) {
        return token;
      }

      if (token.endsWith("es")) {
        return token.slice(0, -2);
      }

      if (token.endsWith("s")) {
        return token.slice(0, -1);
      }

      return token;
    })
    .join(" ");
}

function compactCatalogSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export async function getCatalogProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: {
      slug,
      NOT: {
        code: { in: BLOCKED_PUBLIC_PRODUCT_CODES },
      },
    },
    include: {
      media: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!product) {
    return null;
  }

  const [settings, relatedProducts] = await Promise.all([
    getStoreSettings(),
    prisma.product.findMany({
      where: {
        NOT: {
          code: { in: BLOCKED_PUBLIC_PRODUCT_CODES },
        },
        id: { not: product.id },
        isVisible: true,
        ...(product.categoryId
          ? { categoryId: product.categoryId }
          : product.category
            ? { category: product.category }
            : {}),
        AND: [buildRealProductPhotoWhere()],
      },
      include: {
        media: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
  ]);

  return {
    product: mapProduct(product),
    relatedProducts: relatedProducts.map(mapProduct),
    settings,
  };
}

export async function getCategoryOptions() {
  const categories = await prisma.category.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return categories.map(mapCategory);
}

export async function getBrandOptions() {
  const brands = await prisma.product.findMany({
    where: {
      NOT: {
        code: { in: BLOCKED_PUBLIC_PRODUCT_CODES },
      },
      isVisible: true,
      brand: { not: null },
      AND: [buildRealProductPhotoWhere()],
    },
    distinct: ["brand"],
    orderBy: [{ brand: "asc" }, { id: "asc" }],
    select: { brand: true },
  });

  return brands
    .map((item) => item.brand?.trim())
    .filter((value): value is string => Boolean(value))
    .map((name) => ({ name })) satisfies BrandOption[];
}
