import type {
  Category,
  ErpSyncLog,
  Prisma,
  Product,
  ProductMedia as PrismaProductMedia,
  TrendDirection,
} from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type {
  CatalogProduct,
  CatalogSuggestion,
  CategoryOption,
  DashboardComparisonMetric,
  DashboardTrendProduct,
  HeroBannerView,
  ErpSyncLogView,
  HeroSlideView,
  ProductMediaView,
  StoreSettingsView,
} from "@/lib/store-types";
import {
  buildHeroBannerOrderBy,
  buildHeroBannerWhere,
  mapHeroBanner,
} from "@/lib/hero-banners";
import {
  getPreferredProductImageUrl,
  isGenericProductMediaUrl,
} from "@/lib/product-media";
import { BLOCKED_PUBLIC_PRODUCT_CODES } from "@/lib/public-product-blocklist";

export const PUBLIC_PAGE_SIZE = 24;
export const ADMIN_PAGE_SIZE = 10;

const BRAND_BLUE = "#2320DA";
const LEGACY_PRIMARY_BLUE = "#147cc4";
const LEGACY_BRAND_BLUE = "#292c95";
const LEGACY_BRAND_BLUE_2 = "#0b86d1";
export const GENERIC_PRODUCT_PHOTO_URLS = [
  "https://original.negocioserp.com/logo/imagen-no-disponible.jpg",
];
const GENERIC_PRODUCT_PHOTO_FILTER_URLS = [...GENERIC_PRODUCT_PHOTO_URLS, ""];

const DEFAULT_STORE_SETTINGS: StoreSettingsView = {
  businessName: "Importaciones Super",
  heroTitle: "Catálogo mayorista con pedido directo por WhatsApp",
  heroDescription:
    "Explora el stock disponible, arma tu pedido y envíalo en segundos sin llamadas ni pasos innecesarios.",
  heroSlides: [],
  heroAutoplaySeconds: 5,
  whatsappNumber: "51999999999",
  orderIntro: "Hola, quiero cotizar estos productos:",
  orderFooter: "Quedo atento a la confirmación de stock y total final.",
  currencySymbol: "S/",
  highlightMessage: "Precios por unidad y mayorista sincronizados con el ERP.",
  supportHours: "Lun a sáb 8:00 am - 7:00 pm",
  primaryColor: BRAND_BLUE,
  accentColor: BRAND_BLUE,
};

type ProductWithMedia = Product & {
  media: PrismaProductMedia[];
};

type SuggestionProduct = Pick<
  Product,
  | "id"
  | "slug"
  | "code"
  | "name"
  | "brand"
  | "category"
  | "externalCode"
  | "externalId"
  | "updatedAt"
>;

type ProductPhotoSource = {
  imageUrl: string | null;
  localImageUrl?: string | null;
  media: Array<{ url: string }>;
};

export function isGenericProductPhotoUrl(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  if (GENERIC_PRODUCT_PHOTO_URLS.some((photoUrl) => photoUrl === normalized)) {
    return true;
  }

  return isGenericProductMediaUrl(normalized);
}

export function hasRealProductPhoto(product: ProductPhotoSource) {
  const imageUrl = product.imageUrl?.trim() ?? "";
  const localImageUrl = product.localImageUrl?.trim() ?? "";
  const mediaUrls = product.media.map((item) => item.url.trim()).filter((value) => value.length > 0);

  return [localImageUrl, imageUrl, ...mediaUrls].some(
    (value) => value.length > 0 && !isGenericProductPhotoUrl(value),
  );
}

export function hasProductPhoto(product: ProductPhotoSource) {
  return hasRealProductPhoto(product);
}

export function buildRealProductPhotoWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      {
        AND: [
          { localImageUrl: { not: null } },
          { localImageUrl: { notIn: GENERIC_PRODUCT_PHOTO_FILTER_URLS } },
        ],
      },
      {
        AND: [
          { imageUrl: { not: null } },
          { imageUrl: { notIn: GENERIC_PRODUCT_PHOTO_FILTER_URLS } },
        ],
      },
      {
        media: {
          some: {
            url: { notIn: GENERIC_PRODUCT_PHOTO_FILTER_URLS },
          },
        },
      },
    ],
  };
}

export function buildSellableProductWhere(): Prisma.ProductWhereInput {
  // Productos públicos: marcados como visibles.
  return {
    isVisible: true,
    NOT: {
      code: {
        in: BLOCKED_PUBLIC_PRODUCT_CODES,
      },
    },
    AND: [buildRealProductPhotoWhere()],
  };
}

function normalizeProductSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactProductSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getProductSearchTokenVariants(token: string) {
  const normalizedToken = normalizeProductSearchText(token);
  const variants = [normalizedToken];

  if (normalizedToken.length > 3) {
    if (normalizedToken.endsWith("ces")) {
      variants.push(`${normalizedToken.slice(0, -3)}z`);
    }

    if (normalizedToken.endsWith("es")) {
      variants.push(normalizedToken.slice(0, -2));
    }

    if (normalizedToken.endsWith("s")) {
      variants.push(normalizedToken.slice(0, -1));
    }
  }

  return Array.from(new Set(variants.filter((variant) => variant.length > 1)));
}

function getProductSearchTextVariants(value: string) {
  const normalizedValue = normalizeProductSearchText(value);

  if (!normalizedValue) {
    return [];
  }

  const tokens = normalizedValue.split(" ").filter(Boolean);
  const tokenGroups = tokens.map(getProductSearchTokenVariants);
  const variants = new Set<string>([normalizedValue]);

  for (let index = 0; index < tokenGroups.length; index += 1) {
    for (const tokenVariant of tokenGroups[index]) {
      const nextTokens = [...tokens];
      nextTokens[index] = tokenVariant;
      variants.add(nextTokens.join(" "));
    }
  }

  const fullySingularTokens = tokenGroups.map((group) => group.at(-1) ?? "");

  if (fullySingularTokens.every(Boolean)) {
    variants.add(fullySingularTokens.join(" "));
  }

  return Array.from(variants);
}

export function getProductSearchTerms(query: string) {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeProductSearchText(trimmedQuery);
  const compactQuery = compactProductSearchText(trimmedQuery);
  const variantTerms = getProductSearchTextVariants(trimmedQuery);
  const compactVariantTerms = variantTerms.map(compactProductSearchText);
  const terms = [trimmedQuery, normalizedQuery, compactQuery, ...variantTerms, ...compactVariantTerms]
    .map((term) => term.trim())
    .filter(Boolean);

  return Array.from(new Set(terms));
}

export function getProductSearchTokens(query: string) {
  return getProductSearchTokenGroups(query).map((group) => group[0]).filter(Boolean);
}

export function getProductSearchTokenGroups(query: string) {
  return normalizeProductSearchText(query)
    .split(" ")
    .filter((token) => token.length > 1)
    .map(getProductSearchTokenVariants);
}

function buildProductSearchConditions(term: string): Prisma.ProductWhereInput[] {
  return [
    { name: { contains: term, mode: "insensitive" } },
    { code: { contains: term, mode: "insensitive" } },
    { brand: { contains: term, mode: "insensitive" } },
    { category: { contains: term, mode: "insensitive" } },
    { externalCode: { contains: term, mode: "insensitive" } },
    { externalId: { contains: term, mode: "insensitive" } },
    { slug: { contains: term, mode: "insensitive" } },
  ];
}

export function buildProductSearchWhere(query?: string): Prisma.ProductWhereInput | null {
  const trimmedQuery = query?.trim();

  if (!trimmedQuery) {
    return null;
  }

  const terms = getProductSearchTerms(trimmedQuery);
  const tokenGroups = getProductSearchTokenGroups(trimmedQuery);
  const searchConditions = terms.flatMap(buildProductSearchConditions);

  if (tokenGroups.length > 1) {
    searchConditions.push({
      AND: tokenGroups.map((group) => ({
        OR: group.flatMap(buildProductSearchConditions),
      })),
    });
  }

  return { OR: searchConditions };
}

export function buildMissingProductPhotoWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      { localImageUrl: null },
      { localImageUrl: "" },
      { localImageUrl: { in: GENERIC_PRODUCT_PHOTO_URLS } },
      {
        localImageUrl: {
          contains: "imagen-no-disponible",
          mode: "insensitive",
        },
      },
      {
        localImageUrl: {
          contains: "no-image",
          mode: "insensitive",
        },
      },
      { imageUrl: null },
      { imageUrl: "" },
      { imageUrl: { in: GENERIC_PRODUCT_PHOTO_URLS } },
      {
        imageUrl: {
          contains: "imagen-no-disponible",
          mode: "insensitive",
        },
      },
      {
        imageUrl: {
          contains: "no-image",
          mode: "insensitive",
        },
      },
      {
        imageUrl: {
          contains: "placeholder",
          mode: "insensitive",
        },
      },
      {
        imageUrl: {
          contains: "sin-foto",
          mode: "insensitive",
        },
      },
    ],
    media: {
      none: {
        url: {
          notIn: GENERIC_PRODUCT_PHOTO_FILTER_URLS,
        },
      },
    },
  };
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function mapMedia(media: PrismaProductMedia): ProductMediaView {
  return {
    id: media.id,
    type: media.type,
    url: media.url,
    altText: media.altText,
    sortOrder: media.sortOrder,
  };
}

export function mapProduct(product: ProductWithMedia): CatalogProduct {
  const media = product.media
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(mapMedia);
  const localImageUrl = product.localImageUrl?.trim() ?? "";
  const sourceImageUrl = product.sourceImageUrl?.trim() ?? product.imageUrl?.trim() ?? "";
  const realMedia = media.find((item) => !isGenericProductPhotoUrl(item.url));
  const primaryMedia =
    (localImageUrl
      ? {
          id: "local-image",
          type: "IMAGE" as const,
          url: localImageUrl,
          altText: product.name,
          sortOrder: -1,
        }
      : null) ??
    realMedia ??
    (sourceImageUrl && !isGenericProductPhotoUrl(sourceImageUrl)
      ? {
          id: "legacy-image",
          type: "IMAGE" as const,
          url: sourceImageUrl,
          altText: product.name,
          sortOrder: 0,
        }
      : null);

  return {
    id: product.id,
    code: product.code,
    slug: product.slug,
    name: product.name,
    description: product.description,
    technicalSpecs: product.technicalSpecs,
    brand: product.brand,
    category: product.category,
    categoryId: product.categoryId,
    imageUrl: getPreferredProductImageUrl({
      localImageUrl,
      imageUrl: sourceImageUrl,
      media,
    }),
    sourceImageUrl: sourceImageUrl || null,
    localImageUrl: localImageUrl || null,
    media,
    primaryMedia,
    unitLabel: product.unitLabel,
    unitPrice: Number(product.unitPrice),
    wholesalePrice: toNumber(product.wholesalePrice),
    wholesaleMinQty: product.wholesaleMinQty,
    boxPrice: toNumber(product.boxPrice),
    unitsPerBox: product.unitsPerBox,
    stockUnits: product.stockUnits,
    isVisible: product.isVisible,
    isFeatured: product.isFeatured,
    syncEnabled: product.syncEnabled,
    hasPhoto: hasRealProductPhoto({
      imageUrl: sourceImageUrl || null,
      localImageUrl: localImageUrl || null,
      media: product.media,
    }),
    lastSyncedAt: product.lastSyncedAt?.toISOString() ?? null,
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function mapCategory(category: Category): CategoryOption {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
  };
}

export async function getHeroBannerViews(input: {
  activeOnly?: boolean;
  slot?: "HERO" | "CATEGORY" | "PROMO" | "LANDING" | "WIDGET";
} = {}): Promise<HeroBannerView[]> {
  const now = new Date();
  const banners = await prisma.heroBanner.findMany({
    where: buildHeroBannerWhere(input.slot, input.activeOnly !== false, now),
    orderBy: buildHeroBannerOrderBy(),
  });

  return banners.map((banner) => mapHeroBanner(banner, now));
}

const readStoreSettingsRecord = cache(async () =>
  prisma.storeSettings.findUnique({ where: { id: 1 } }),
);

function parseHeroSlides(value: Prisma.JsonValue | null | undefined): HeroSlideView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const imageUrl =
        "imageUrl" in entry && typeof entry.imageUrl === "string" ? entry.imageUrl : "";
      const title =
        "title" in entry && typeof entry.title === "string" && entry.title.trim()
          ? entry.title
          : null;
      const text =
        "text" in entry && typeof entry.text === "string" && entry.text.trim()
          ? entry.text
          : null;

      if (!imageUrl.trim()) {
        return null;
      }

      return {
        imageUrl,
        title,
        text,
      } satisfies HeroSlideView;
    })
    .filter((entry): entry is HeroSlideView => Boolean(entry));
}

function mapStoreSettings(
  settings: Awaited<ReturnType<typeof readStoreSettingsRecord>>,
): StoreSettingsView {
  const storedPrimaryColor = settings?.primaryColor?.toLowerCase() ?? null;
  const primaryColor =
    storedPrimaryColor === LEGACY_PRIMARY_BLUE ||
    storedPrimaryColor === LEGACY_BRAND_BLUE ||
    storedPrimaryColor === LEGACY_BRAND_BLUE_2
      ? BRAND_BLUE
      : settings?.primaryColor ?? DEFAULT_STORE_SETTINGS.primaryColor;

  return {
    businessName: settings?.businessName ?? DEFAULT_STORE_SETTINGS.businessName,
    heroTitle: settings?.heroTitle ?? DEFAULT_STORE_SETTINGS.heroTitle,
    heroDescription: settings?.heroDescription ?? DEFAULT_STORE_SETTINGS.heroDescription,
    heroSlides: parseHeroSlides(settings?.heroSlides),
    heroAutoplaySeconds:
      settings?.heroAutoplaySeconds ?? DEFAULT_STORE_SETTINGS.heroAutoplaySeconds,
    whatsappNumber: settings?.whatsappNumber ?? DEFAULT_STORE_SETTINGS.whatsappNumber,
    orderIntro: settings?.orderIntro ?? DEFAULT_STORE_SETTINGS.orderIntro,
    orderFooter: settings?.orderFooter ?? DEFAULT_STORE_SETTINGS.orderFooter,
    currencySymbol: settings?.currencySymbol ?? DEFAULT_STORE_SETTINGS.currencySymbol,
    highlightMessage: settings?.highlightMessage ?? DEFAULT_STORE_SETTINGS.highlightMessage,
    supportHours: settings?.supportHours ?? DEFAULT_STORE_SETTINGS.supportHours,
    primaryColor,
    accentColor: primaryColor,
  };
}

export async function getStoreSettings(): Promise<StoreSettingsView> {
  return mapStoreSettings(await readStoreSettingsRecord());
}

export function calculateDeltaPercent(currentValue: number, previousValue: number | null) {
  if (previousValue === null || previousValue === 0) {
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

export function buildComparisonMetric(
  label: string,
  currentValue: number,
  previousValue: number | null,
): DashboardComparisonMetric {
  return {
    label,
    currentValue,
    previousValue,
    deltaPercent: calculateDeltaPercent(currentValue, previousValue),
  };
}

export function mapErpSyncLog(log: ErpSyncLog): ErpSyncLogView {
  const finishedAt = log.finishedAt?.toISOString() ?? null;
  const updatedAt = log.updatedAt.toISOString();
  const progressPercent =
    log.progressTotalCount > 0
      ? Math.min(100, Math.round((log.processedCount / log.progressTotalCount) * 100))
      : null;

  return {
    id: log.id,
    source: log.source,
    trigger: log.trigger,
    syncMode: log.syncMode,
    status: log.status,
    fetchedCount: log.fetchedCount,
    progressTotalCount: log.progressTotalCount,
    processedCount: log.processedCount,
    createdCount: log.createdCount,
    updatedCount: log.updatedCount,
    skippedCount: log.skippedCount,
    errorCount: log.errorCount,
    failedPage: log.failedPage,
    failedPageMessage: log.failedPageMessage,
    errorMessage: log.errorMessage,
    cancelRequestedAt: log.cancelRequestedAt?.toISOString() ?? null,
    initiatedByName: log.initiatedByName,
    initiatedByEmail: log.initiatedByEmail,
    canceledByName: log.canceledByName,
    canceledByEmail: log.canceledByEmail,
    startedAt: log.startedAt.toISOString(),
    finishedAt,
    updatedAt,
    durationMs: log.finishedAt ? log.finishedAt.getTime() - log.startedAt.getTime() : null,
    progressPercent,
  };
}

export function buildWhere(
  query?: string,
  category?: string,
  brand?: string,
  visibleOnly = true,
  featuredOnly = false,
): Prisma.ProductWhereInput {
  const trimmedQuery = query?.trim();
  const trimmedCategory = category?.trim();
  const trimmedBrand = brand?.trim();
  const conditions: Prisma.ProductWhereInput[] = [];

  if (visibleOnly) {
    conditions.push(buildSellableProductWhere());
  }

  if (trimmedCategory && trimmedCategory !== "all") {
    conditions.push({
      OR: [{ category: trimmedCategory }, { categoryRef: { slug: trimmedCategory } }],
    });
  }

  if (trimmedBrand && trimmedBrand !== "all") {
    conditions.push({
      brand: {
        equals: trimmedBrand,
        mode: "insensitive",
      },
    });
  }

  if (featuredOnly) {
    conditions.push({ isFeatured: true });
  }

  if (trimmedQuery) {
    const searchWhere = buildProductSearchWhere(trimmedQuery);

    if (searchWhere) {
      conditions.push(searchWhere);
    }
  }

  return conditions.length ? { AND: conditions } : {};
}

function mapSuggestion(product: SuggestionProduct): CatalogSuggestion {
  return {
    id: product.id,
    slug: product.slug,
    code: product.code,
    name: product.name,
    brand: product.brand,
    category: product.category,
  };
}

export function getSuggestionScore(product: SuggestionProduct, query: string) {
  const searchTerms = getProductSearchTerms(query);
  const normalizedQueries = searchTerms.map(normalizeProductSearchText);
  const compactQueries = searchTerms.map(compactProductSearchText);
  const tokenGroups = getProductSearchTokenGroups(query);
  const values = [
    { value: product.code, exact: 100, starts: 92, includes: 76 },
    { value: product.externalCode, exact: 98, starts: 90, includes: 74 },
    { value: product.externalId, exact: 96, starts: 88, includes: 72 },
    { value: product.name, exact: 94, starts: 86, includes: 66 },
    { value: product.brand, exact: 90, starts: 82, includes: 60 },
    { value: product.category, exact: 84, starts: 78, includes: 56 },
    { value: product.slug, exact: 70, starts: 62, includes: 50 },
  ];
  let score = 0;

  for (const item of values) {
    const normalizedValue = normalizeProductSearchText(item.value ?? "");
    const compactValue = compactProductSearchText(item.value ?? "");

    if (!normalizedValue && !compactValue) {
      continue;
    }

    for (const normalizedQuery of normalizedQueries) {
      if (normalizedQuery && normalizedValue === normalizedQuery) {
        score = Math.max(score, item.exact);
      }

      if (normalizedQuery && normalizedValue.startsWith(normalizedQuery)) {
        score = Math.max(score, item.starts);
      }

      if (normalizedQuery && normalizedValue.includes(normalizedQuery)) {
        score = Math.max(score, item.includes);
      }
    }

    for (const compactQuery of compactQueries) {
      if (compactQuery && compactValue === compactQuery) {
        score = Math.max(score, item.exact);
      }

      if (compactQuery && compactValue.startsWith(compactQuery)) {
        score = Math.max(score, item.starts);
      }

      if (compactQuery && compactValue.includes(compactQuery)) {
        score = Math.max(score, item.includes);
      }
    }
  }

  if (
    tokenGroups.length > 1 &&
    tokenGroups.every((group) =>
      group.some((token) =>
        values.some((item) => normalizeProductSearchText(item.value ?? "").includes(token)),
      ),
    )
  ) {
    score = Math.max(score, 54);
  }

  return score;
}

export function mapCatalogMovementProduct(
  product: Pick<Product, "code" | "name" | "stockUnits" | "lastSyncedAt" | "updatedAt">,
  direction: TrendDirection,
  referenceDate: Date,
): DashboardTrendProduct {
  const activityDate = product.lastSyncedAt ?? product.updatedAt;
  const ageDays = Math.max(
    0,
    Math.floor((referenceDate.getTime() - activityDate.getTime()) / 86_400_000),
  );
  const freshnessScore = Math.max(0, 100 - ageDays * 7);

  return {
    code: product.code,
    name: product.name,
    unitsSold: product.stockUnits,
    deltaPercent: direction === "RISING" ? freshnessScore : -Math.min(100, ageDays * 5),
    momentumScore: direction === "RISING" ? freshnessScore : Math.min(100, ageDays * 5),
    direction,
  };
}

export function mapSuggestionResults(products: SuggestionProduct[], query: string, limit = 6) {
  return products
    .map((product) => ({ product, score: getSuggestionScore(product, query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return right.product.updatedAt.getTime() - left.product.updatedAt.getTime();
    })
    .slice(0, limit)
    .map((item) => item.product)
    .map(mapSuggestion);
}
