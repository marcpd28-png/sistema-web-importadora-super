import { getStorefrontIndex, getStorefrontCategories, getStorefrontFamilies } from "@/lib/storefront-index";
import { categoryMatches, canonicalCategorySlug, groupColorVariants, getStorefrontCategorySlug, variantGroupKey } from "@/lib/storefront-taxonomy";
import { getStorefrontCampaigns } from "@/lib/storefront-campaigns";
import { getErpBestSellerSnapshot } from "@/lib/erp-sales";
import { Prisma } from "@prisma/client";
import { buildRealProductPhotoSql } from "@/lib/product-photo-policy";
import { prisma } from "@/lib/prisma";
import { BLOCKED_PUBLIC_PRODUCT_CODES } from "@/lib/public-product-blocklist";
import {
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
  query?: string; category?: string; brand?: string; page?: number;
  featuredOnly?: boolean; collection?: string; sort?: string;
  minPrice?: number; maxPrice?: number; inStock?: boolean; viewAll?: boolean;
}) {
  const collection = input.collection?.trim().toLowerCase() ?? "";
  const category = canonicalCategorySlug(input.category?.trim() || "all");
  const isHomeView = !input.query?.trim() && category === "all" &&
    (!input.brand || input.brand === "all") && !collection && !input.featuredOnly &&
    (!input.sort || input.sort === "featured") && !input.viewAll && input.minPrice === undefined && input.maxPrice === undefined && !input.inStock && (input.page ?? 1) === 1;
  const [index, categories, campaigns, settings, heroBanners, snapshot, searchRows] = await Promise.all([
    getStorefrontIndex(), getStorefrontCategories(), getStorefrontCampaigns(), getStoreSettings(),
    getHeroBannerViews({ slot: "HERO" }),
    isHomeView || collection === "mas-vendidos" ? getErpBestSellerSnapshot(1000) : Promise.resolve({ codes: [] as string[], summary: EMPTY_SALES_SUMMARY }),
    input.query?.trim() ? prisma.product.findMany({ where: buildWhere(input.query), select: { id: true } }) : null,
  ]);
  const families = getStorefrontFamilies(categories);
  const searchIds = searchRows ? new Set(searchRows.map(row => row.id)) : null;
  const ranked = rankProductsByCode(index.filter(p => [p.code, p.externalCode, p.externalId].some(code => code && snapshot.codes.includes(code))), snapshot.codes);
  const campaign = campaigns.find(item => item.slug === collection);
  const collectionCategory = ["proyectores", "pantallas-proyeccion", "drones", "alexas", "consolas", "mandos", "hogar-inteligente"].includes(collection) ? collection : null;
  let candidates = index.filter(p =>
    categoryMatches(p.storefrontCategory, category) &&
    (!collectionCategory || p.storefrontCategory === collectionCategory) &&
    (!input.brand || input.brand === "all" || p.brand?.toLowerCase() === input.brand.toLowerCase()) &&
    (!searchIds || searchIds.has(p.id)) && (!input.featuredOnly || p.isFeatured) &&
    (input.minPrice === undefined || p.unitPrice >= input.minPrice) &&
    (input.maxPrice === undefined || p.unitPrice <= input.maxPrice) && (!input.inStock || p.stockUnits > 0) &&
    (collection !== "mas-vendidos" || ranked.some(row => row.id === p.id)) &&
    (!campaign || (campaign.visible && campaign.productIds.includes(p.id))) &&
    (collection !== "destacados" || p.isFeatured));
  if (collection === "mas-vendidos") candidates = rankProductsByCode(candidates, snapshot.codes);
  else if (input.sort === "price-asc") candidates.sort((a, b) => a.unitPrice - b.unitPrice || a.id.localeCompare(b.id));
  else if (input.sort === "price-desc") candidates.sort((a, b) => b.unitPrice - a.unitPrice || a.id.localeCompare(b.id));
  else if (input.sort === "newest") candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  else if (campaign) candidates.sort((a, b) => campaign.productCodes.indexOf(a.code) - campaign.productCodes.indexOf(b.code));
  else candidates.sort((a, b) => {
    return Number(b.stockUnits > 0) - Number(a.stockUnits > 0) || Number(b.isFeatured) - Number(a.isFeatured) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
  });
  const groups = groupColorVariants(candidates);
  const totalPages = Math.max(1, Math.ceil(groups.length / PUBLIC_PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number.isFinite(input.page) ? input.page! : 1)));
  const pageGroups = groups.slice((page - 1) * PUBLIC_PAGE_SIZE, page * PUBLIC_PAGE_SIZE);
  const bestGroups = groupColorVariants(ranked.filter(p => p.storefrontCategory !== "bienestar-intimo")).slice(0, 8);
  const sectionGroups = isHomeView ? families.filter(f => f.slug !== "familia-intimo").slice(0, 6).map(family => ({
    family, groups: groupColorVariants(index.filter(p => categoryMatches(p.storefrontCategory, family.slug))
      .sort((a,b) => Number(b.stockUnits > 0) - Number(a.stockUnits > 0))).slice(0, 8),
  })) : [];
  const ids = [...new Set([...pageGroups.flat(), ...bestGroups.flat(), ...sectionGroups.flatMap(section => section.groups.flat())].map(p => p.id))];
  const rows = ids.length ? await prisma.product.findMany({ where: { AND: [buildSellableProductWhere(), { id: { in: ids } }] }, include: { media: { orderBy: { sortOrder: "asc" } } } }) : [];
  const byId = new Map(rows.map(row => [row.id, mapProduct(row)]));
  const hydrate = (items: typeof groups) => items.flatMap(group => {
    const variants = group.flatMap(row => byId.has(row.id) ? [byId.get(row.id)!] : []);
    return variants.length ? [{ ...variants[0], colorVariants: variants.length > 1 ? variants : undefined }] : [];
  });
  return {
    products: hydrate(pageGroups), bestSellerProducts: hydrate(bestGroups), salesSummary: snapshot.summary,
    totalResults: groups.length, totalSkuResults: candidates.length, totalPages, page, isHomeView,
    featuredOnly: Boolean(input.featuredOnly), selectedBrand: input.brand?.trim() || "all", selectedSort: input.sort || "featured",
    categories, families, selectedCategory: [...families, ...categories].find(c => c.slug === (collectionCategory ?? category)),
    brands: [...new Set(index.filter(p => categoryMatches(p.storefrontCategory, collectionCategory ?? category)).map(p => p.brand).filter((b): b is string => Boolean(b)))].sort().map(name => ({ name })),
    campaignDescription: campaign?.visible ? campaign.description : "",
    stats: { visibleCount: index.length, featuredCount: index.filter(p => p.isFeatured).length },
    settings, heroBanners,
    homeCategorySections: sectionGroups.map(section => ({ category: section.family, productCount: section.family.productCount ?? 0, products: hydrate(section.groups) })),
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
      ...buildSellableProductWhere(),
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
  const commercialCategories = await getStorefrontCategories();
  const exactCollection = COLLECTION_SEARCH_ALIASES.find(item => item.terms.some(term => normalizeCatalogSearchText(term) === normalizedQuery));
  if (exactCollection) return { href: exactCollection.href, kind: "collection" };
  const exactCategory = commercialCategories.find(item => normalizeCatalogSearchText(item.name) === normalizedQuery || item.slug === normalizedQuery);
  if (exactCategory) return { href: '/?category=' + encodeURIComponent(exactCategory.slug), kind: "category" };
  const matchingProductCount = await prisma.product.count({
    where: buildWhere(trimmedQuery),
  });

  if (matchingProductCount > 1) {
    return null;
  }

  if (matchingProductCount === 1) {
    const exactProductSlug = await getExactCatalogProductSlug(trimmedQuery);

    if (exactProductSlug) {
      return { href: `/producto/${exactProductSlug}`, kind: "product" };
    }

    return null;
  }

  const brandMatch = await getBrandSearchDestination(trimmedQuery);
  if (brandMatch) {
    return brandMatch;
  }

  const categories = commercialCategories;

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
    LEFT JOIN "Category" c ON c.id = p."categoryId"
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
  return buildRealProductPhotoSql();
}

const SUGGESTION_NAME_COLUMNS = [Prisma.sql`p.name`];
const SUGGESTION_DESCRIPTION_COLUMNS = [Prisma.sql`p.description`, Prisma.sql`p."technicalSpecs"`];
const SUGGESTION_BRAND_COLUMNS = [Prisma.sql`p.brand`];
const SUGGESTION_CODE_COLUMNS = [
  Prisma.sql`p.code`,
  Prisma.sql`p."externalCode"`,
  Prisma.sql`p."externalId"`,
];
const SUGGESTION_CATEGORY_COLUMNS = [Prisma.sql`p.category`, Prisma.sql`c.name`, Prisma.sql`c.slug`];
const SUGGESTION_SLUG_COLUMNS = [Prisma.sql`p.slug`];
const SUGGESTION_SEARCH_COLUMNS = [
  ...SUGGESTION_NAME_COLUMNS,
  ...SUGGESTION_DESCRIPTION_COLUMNS,
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
      ...buildSellableProductWhere(),
      slug,
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

  const [settings, index] = await Promise.all([getStoreSettings(), getStorefrontIndex()]);
  const leaf = getStorefrontCategorySlug(product);
  const relatedGroups = groupColorVariants(index.filter(item => item.storefrontCategory === leaf &&
    variantGroupKey(item) !== variantGroupKey(product)).sort((a, b) => Number(b.stockUnits > 0) - Number(a.stockUnits > 0))).slice(0, 8);
  const relatedIds = relatedGroups.flat().map(item => item.id);
  const relatedRows = relatedIds.length ? await prisma.product.findMany({
    where: { AND: [buildSellableProductWhere(), { id: { in: relatedIds } }] },
    include: { media: { orderBy: { sortOrder: "asc" } } },
  }) : [];
  const relatedById = new Map(relatedRows.map(row => [row.id, mapProduct(row)]));
  const relatedProducts = relatedGroups.flatMap(group => {
    const variants = group.flatMap(item => relatedById.has(item.id) ? [relatedById.get(item.id)!] : []);
    return variants.length ? [{ ...variants[0], colorVariants: variants.length > 1 ? variants : undefined }] : [];
  });

  return {
    product: mapProduct(product),
    relatedProducts,
    settings,
  };
}

import { unstable_cache } from "next/cache";

export const getCategoryOptions = unstable_cache(
  async () => {
    const categories = await prisma.category.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return categories.map(mapCategory);
  },
  ["category-options-key"],
  { revalidate: 60, tags: ["categories"] },
);

export const getActiveCategories = unstable_cache(
  async () => {
    return prisma.category.findMany({
      where: {
        products: {
          some: {
            AND: [buildSellableProductWhere()],
          },
        },
      },
      orderBy: { name: "asc" },
    });
  },
  ["active-categories-key"],
  { revalidate: 60, tags: ["categories"] },
);

export const getBrandOptions = unstable_cache(
  async () => {
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
  },
  ["brand-options-key"],
  { revalidate: 60, tags: ["brands"] },
);
