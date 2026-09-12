import { getPreferredProductImageUrl } from "@/lib/product-media";
import { prisma } from "@/lib/prisma";
import { resolveProductBrand } from "@/lib/product-discovery";

const STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "cuanto",
  "cuesta",
  "costo",
  "dame",
  "de",
  "del",
  "deseo",
  "el",
  "en",
  "ese",
  "esa",
  "este",
  "esta",
  "hay",
  "informacion",
  "la",
  "las",
  "lo",
  "los",
  "mas",
  "me",
  "necesito",
  "para",
  "por",
  "precio",
  "producto",
  "productos",
  "quiero",
  "sale",
  "stock",
  "tienen",
  "tienes",
  "unidad",
  "unidades",
  "comprar",
  "compra",
  "mayor",
  "mayorista",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(value: string) {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token.toLowerCase()))
    .slice(0, 8);
}

function scoreProduct(
  product: {
    code: string;
    name: string;
    brand: string | null;
    category: string | null;
    externalCode: string | null;
  },
  tokens: string[],
  normalizedQuery: string,
) {
  const code = normalize(product.code);
  const externalCode = normalize(product.externalCode ?? "");
  const name = normalize(product.name);
  const brand = normalize(product.brand ?? "");
  const category = normalize(product.category ?? "");
  let score = 0;

  if (code === normalizedQuery || externalCode === normalizedQuery) score += 100;
  if (name === normalizedQuery) score += 80;
  if (name.includes(normalizedQuery) && normalizedQuery.length >= 3) score += 35;
  if (brand === normalizedQuery) score += 20;

  for (const token of tokens) {
    if (code === token || externalCode === token) score += 30;
    if (code.includes(token) || externalCode.includes(token)) score += 15;
    if (name.split(" ").includes(token)) score += 10;
    else if (name.includes(token)) score += 6;
    if (brand.includes(token)) score += 5;
    if (category.includes(token)) score += 3;
  }

  return score;
}

export async function resolveRouterV2TextProduct(query: string) {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);

  if (!normalizedQuery || tokens.length === 0) {
    return {
      status: "NO_QUERY" as const,
      count: 0,
      matches: [],
    };
  }

  const rows = await prisma.product.findMany({
    where: {
      isVisible: true,
      stockUnits: { gt: 0 },
      AND: tokens.map((token) => ({
        OR: [
          { code: { contains: token, mode: "insensitive" as const } },
          { externalCode: { contains: token, mode: "insensitive" as const } },
          { name: { contains: token, mode: "insensitive" as const } },
          { brand: { contains: token, mode: "insensitive" as const } },
          { category: { contains: token, mode: "insensitive" as const } },
        ],
      })),
    },
    select: {
      id: true,
      code: true,
      externalCode: true,
      slug: true,
      name: true,
      brand: true,
      category: true,
      imageUrl: true,
      localImageUrl: true,
      media: {
        orderBy: { sortOrder: "asc" },
        take: 4,
        where: { type: "IMAGE" },
        select: { url: true },
      },
      unitPrice: true,
      wholesalePrice: true,
      wholesaleMinQty: true,
    },
    take: 80,
  });

  const matches = rows
    .map((product) => ({
      product,
      score: scoreProduct(product, tokens, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ product }) => ({
      id: product.id,
      code: product.code,
      slug: product.slug,
      name: product.name,
      brand: resolveProductBrand(product),
      category: product.category,
      imageUrl: getPreferredProductImageUrl({
        localImageUrl: product.localImageUrl,
        imageUrl: product.imageUrl,
        media: product.media,
      }),
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
        ? ("NOT_FOUND" as const)
        : matches.length === 1
          ? ("UNIQUE" as const)
          : ("MULTIPLE" as const),
    count: matches.length,
    matches,
  };
}
