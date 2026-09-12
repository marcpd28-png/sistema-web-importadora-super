import { prisma } from "@/lib/prisma";

type BrandableProduct = {
  name: string;
  brand?: string | null;
};

const VERIFIED_BRANDS = [
  ["HARMAN KARDON", "Harman Kardon"],
  ["ANKER SOUNDCORE", "Anker Soundcore"],
  ["SOUNDCORE", "Anker Soundcore"],
  ["TRONSMART", "Tronsmart"],
  ["KAPERH", "Kaperh"],
  ["ZEALOT", "Zealot"],
  ["LIDIMI", "Lidimi"],
  ["SONIVOX", "Sonivox"],
  ["XIAOMI", "Xiaomi"],
  ["BOSSNEY", "Bossney"],
  ["HALION", "Halion"],
  ["AIWA", "Aiwa"],
  ["SONY", "Sony"],
  ["JBL", "JBL"],
] as const;

const GENERIC_BRANDS = new Set([
  "GENERICO",
  "GENÉRICO",
]);

const SPEAKER_EXCLUSIONS = [
  /\bSOPORTE\s+CON\s+PARLANTE\b/i,
  /\bWALKI(?:E)?\s*TALKIE\b/i,
  /\bINTERCOMUNICADOR\b/i,
  /\bBUDS?\b/i,
  /\bAUDIFONOS?\b/i,
  /\bAURICULARES?\b/i,
  /\bHEADPHONES?\b/i,
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function resolveProductBrand(
  product: BrandableProduct,
): string | null {
  const explicitBrand = product.brand?.trim();

  if (explicitBrand) {
    const normalized = normalizeText(explicitBrand);

    if (!GENERIC_BRANDS.has(normalized)) {
      return explicitBrand;
    }
  }

  const name = normalizeText(product.name);

  for (const [needle, label] of VERIFIED_BRANDS) {
    if (name.includes(needle)) {
      return label;
    }
  }

  return null;
}

export function isRelevantSpeaker(product: {
  name: string;
  category?: string | null;
}) {
  const text = normalizeText(
    `${product.name} ${product.category ?? ""}`,
  );

  const looksLikeSpeaker =
    /\bPARLANTES?\b/.test(text) ||
    /\bSPEAKER\b/.test(text);

  if (!looksLikeSpeaker) {
    return false;
  }

  return !SPEAKER_EXCLUSIONS.some((pattern) =>
    pattern.test(text),
  );
}

export async function discoverSpeakerBrands() {
  const rows = await prisma.product.findMany({
    where: {
      isVisible: true,
      stockUnits: { gt: 0 },
      category: {
        contains: "PARLANT",
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      code: true,
      slug: true,
      name: true,
      brand: true,
      category: true,
      imageUrl: true,
      localImageUrl: true,
      unitPrice: true,
    },
    orderBy: [
      { isFeatured: "desc" },
      { updatedAt: "desc" },
    ],
    take: 500,
  });

  const representatives =
    new Map<string, (typeof rows)[number]>();

  for (const product of rows) {
    if (!isRelevantSpeaker(product)) continue;

    const brand = resolveProductBrand(product);

    if (!brand || representatives.has(brand)) continue;

    representatives.set(brand, product);
  }

  return [...representatives.entries()]
    .map(([brand, product]) => ({
      brand,
      representative: {
        id: product.id,
        code: product.code,
        slug: product.slug,
        name: product.name,
        category: product.category,
        imageUrl:
          product.localImageUrl ??
          product.imageUrl ??
          null,
        unitPrice: Number(product.unitPrice),
        productUrl: `/producto/${product.slug}`,
      },
    }))
    .sort((a, b) =>
      a.brand.localeCompare(b.brand, "es"),
    );
}

function normalizeDiscoveryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function discoverExactProducts(input: {
  brand: string;
  model: string;
}) {
  const brand = normalizeDiscoveryText(input.brand);
  const model = normalizeDiscoveryText(input.model);

  const modelTokens = model
    .split(" ")
    .filter(Boolean);

  const rows = await prisma.product.findMany({
    where: {
      isVisible: true,
      stockUnits: { gt: 0 },
      AND: modelTokens.map((token) => ({
        name: {
          contains: token,
          mode: "insensitive" as const,
        },
      })),
    },
    select: {
      id: true,
      code: true,
      slug: true,
      name: true,
      brand: true,
      category: true,
      imageUrl: true,
      localImageUrl: true,
      unitPrice: true,
      wholesalePrice: true,
      wholesaleMinQty: true,
    },
    take: 100,
  });

  const matches = rows
    .filter((product) => {
      const resolvedBrand = resolveProductBrand(product);

      if (!resolvedBrand) return false;

      const productBrand =
        normalizeDiscoveryText(resolvedBrand);

      const productName =
        normalizeDiscoveryText(product.name);

      const hasModel = modelTokens.every((token) =>
        productName.split(" ").includes(token),
      );

      return productBrand === brand && hasModel;
    })
    .map((product) => ({
      id: product.id,
      code: product.code,
      slug: product.slug,
      name: product.name,
      brand: resolveProductBrand(product),
      category: product.category,
      imageUrl:
        product.localImageUrl ??
        product.imageUrl ??
        null,
      unitPrice: Number(product.unitPrice),
      wholesalePrice:
        product.wholesalePrice === null
          ? null
          : Number(product.wholesalePrice),
      wholesaleMinQty: product.wholesaleMinQty,
      productUrl: `/producto/${product.slug}`,
    }));

  return {
    status:
      matches.length === 0
        ? "NOT_FOUND"
        : matches.length === 1
          ? "UNIQUE"
          : "MULTIPLE",
    count: matches.length,
    matches,
  } as const;
}
