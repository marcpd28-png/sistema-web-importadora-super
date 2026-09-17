import { getPreferredProductImageUrl } from "@/lib/product-media";
import { prisma } from "@/lib/prisma";
import { resolveProductBrand } from "@/lib/product-discovery";

const STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "buenas",
  "busco",
  "buscando",
  "cuanto",
  "cuesta",
  "costo",
  "dame",
  "dias",
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
  "un",
  "una",
  "unidad",
  "unidades",
  "comprar",
  "compra",
  "mayor",
  "mayorista",
  "hola",
  "ola",
  "quisiera",
  "saber",
  "unos",
  "unas",
  "tarde",
  "tardes",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(?:SCUTER|SCOTER|ESCUTER|ESKUTER|SCCOTER|SCOOTERS?)\b/g, "SCOOTER")
    .replace(/\b(?:PARLNTES?|PARLENTE?S?|PARLANTES?)\b/g, "PARLANTE")
    .replace(/\b(?:AUDIFNOS?|AUDIFON?S?|AUDIFONOS?|AURICULARE?S?|AIRPODS?|AIRDOTS?)\b/g, "AUDIFONO")
    .replace(/\b(?:MICROFNOS?|MICROFONOS?|MICROFONO?S?|MIC)\b/g, "MICROFONO")
    .replace(/\b(?:TABLETS?|TABLETAS?)\b/g, "TABLET")
    .replace(/\b(?:CELULARE?S?|CELLULARE?S?|TELEFONOS?|MOVILES?|MOBILES?)\b/g, "CELULAR")
    .replace(/\b(?:CARGDOR(?:ES)?|CARGADORES?|CHARGER|CARGA)\b/g, "CARGADOR")
    .replace(/\b(?:RELOJES?|SMARTWATCH(?:ES)?)\b/g, "SMARTWATCH")
    .replace(/\b(?:LAPTOPS?|NOTEBOOKS?)\b/g, "LAPTOP")
    .replace(/\b(?:PANTALLAS?|MONITORES?)\b/g, "PANTALLA")
    .replace(/\b(?:MOUSES?|MAUSES?|RATONES?)\b/g, "MOUSE")
    .replace(/\b(?:ROUTERS?|RUTERS?)\b/g, "ROUTER")
    .replace(/\bELECTRIC[OA]S?\b/g, "ELECTRICO")
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

const SEARCH_SYNONYMS: Record<string, string[]> = {
  AUDIFONO: ["AURICULARES", "TWS", "BLUETOOTH", "HEADPHONE", "EARBUDS"],
  AIRPODS: ["AUDIFONO", "AURICULARES", "TWS", "BLUETOOTH"],
  EARBUDS: ["AUDIFONO", "AURICULARES", "TWS", "BLUETOOTH"],
  EARPHONE: ["AUDIFONO", "AURICULARES"],
  EARPHONES: ["AUDIFONO", "AURICULARES"],
  PARLANTE: ["SPEAKER", "BLUETOOTH", "BAFLE"],
  MICROFONO: ["MIC", "MICROPHONE"],
  CELULAR: ["SMARTPHONE", "TELEFONO", "IPHONE"],
  CARGADOR: ["ADAPTADOR", "CHARGER", "CARGA"],
  SMARTWATCH: ["RELOJ", "WATCH"],
  PANTALLA: ["MONITOR", "DISPLAY"],
  ROUTER: ["RUTER", "WIFI"],
};

function expandedTokenGroup(token: string) {
  return [token, ...(SEARCH_SYNONYMS[token] ?? [])];
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

    for (const synonym of SEARCH_SYNONYMS[token] ?? []) {
      if (name.includes(synonym)) score += 5;
      if (category.includes(synonym)) score += 4;
    }
  }

  return score;
}

export async function resolveRouterV2TextProduct(
  query: string,
  options: { includeUnavailable?: boolean } = {},
) {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);

  if (!normalizedQuery || tokens.length === 0) {
    return {
      status: "NO_QUERY" as const,
      count: 0,
      matches: [],
    };
  }

  const availabilityFilter = options.includeUnavailable
    ? {}
    : { stockUnits: { gt: 0 } };
  const tokenGroups = tokens.map(expandedTokenGroup);
  const tokenSearchClause = (token: string) => ({
    OR: [
      { code: { contains: token, mode: "insensitive" as const } },
      { externalCode: { contains: token, mode: "insensitive" as const } },
      { name: { contains: token, mode: "insensitive" as const } },
      { brand: { contains: token, mode: "insensitive" as const } },
      { category: { contains: token, mode: "insensitive" as const } },
    ],
  });
  const select = {
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
    stockUnits: true,
  } as const;

  let rows = await prisma.product.findMany({
    where: {
      isVisible: true,
      ...availabilityFilter,
      AND: tokenGroups.map((group) => ({
        OR: group.flatMap((token) => tokenSearchClause(token).OR),
      })),
    },
    select,
    take: 80,
  });

  if (rows.length === 0 && tokenGroups.some((group) => group.length > 1)) {
    const expandedTokens = [...new Set(tokenGroups.flat())];
    rows = await prisma.product.findMany({
      where: {
        isVisible: true,
        ...availabilityFilter,
        OR: expandedTokens.flatMap((token) => tokenSearchClause(token).OR),
      },
      select,
      take: 80,
    });
  }

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
      available: product.stockUnits > 0,
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
