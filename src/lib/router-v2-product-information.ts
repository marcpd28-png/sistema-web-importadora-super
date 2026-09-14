import { getPreferredProductImageUrl } from "@/lib/product-media";
import { prisma } from "@/lib/prisma";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RouterV2ProductInformation = {
  code: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  technicalSpecs: string | null;
  descriptionShort: string | null;
  descriptionFull: string | null;
  imageUrl: string | null;
  media: Array<{
    type: "IMAGE" | "VIDEO";
    url: string;
    altText: string | null;
  }>;
  unitPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number;
  available: boolean;
  specifications: Array<{ name: string; value: string }>;
  variants: Array<{
    name: string;
    sku: string | null;
    imageUrl: string | null;
    isAvailable: boolean;
  }>;
  documents: Array<{ title: string; url: string; type: string }>;
};

export async function getRouterV2ProductInformation(
  productCode: string,
): Promise<RouterV2ProductInformation | null> {
  const code = productCode.trim();
  if (!code) return null;

  const product = await prisma.product.findFirst({
    where: {
      code: { equals: code, mode: "insensitive" },
      isVisible: true,
    },
    select: {
      code: true,
      slug: true,
      name: true,
      brand: true,
      category: true,
      description: true,
      technicalSpecs: true,
      imageUrl: true,
      localImageUrl: true,
      unitPrice: true,
      wholesalePrice: true,
      wholesaleMinQty: true,
      stockUnits: true,
      digitalProfile: {
        select: {
          descriptionShort: true,
          descriptionFull: true,
          status: true,
        },
      },
      media: {
        orderBy: { sortOrder: "asc" },
        take: 8,
        select: {
          type: true,
          url: true,
          altText: true,
        },
      },
      specifications: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, value: true },
      },
      variants: {
        orderBy: { sortOrder: "asc" },
        select: {
          name: true,
          sku: true,
          imageUrl: true,
          isAvailable: true,
        },
      },
      documents: {
        orderBy: { sortOrder: "asc" },
        take: 8,
        select: { title: true, url: true, type: true },
      },
    },
  });

  if (!product) return null;

  const publishedProfile =
    product.digitalProfile?.status === "PUBLICADA"
      ? product.digitalProfile
      : null;

  return {
    code: product.code,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    technicalSpecs: product.technicalSpecs,
    descriptionShort: publishedProfile?.descriptionShort ?? null,
    descriptionFull: publishedProfile?.descriptionFull ?? null,
    imageUrl: getPreferredProductImageUrl({
      localImageUrl: product.localImageUrl,
      imageUrl: product.imageUrl,
      media: product.media,
    }),
    media: product.media,
    unitPrice: Number(product.unitPrice),
    wholesalePrice:
      product.wholesalePrice === null ? null : Number(product.wholesalePrice),
    wholesaleMinQty: product.wholesaleMinQty,
    available: product.stockUnits > 0,
    specifications: product.specifications,
    variants: product.variants,
    documents: product.documents,
  };
}

const SPEC_ALIASES: Array<[RegExp, string[]]> = [
  [/\b(bateria|autonomia|duracion|horas)\b/, ["bateria", "autonomia", "duracion", "horas"]],
  [/\b(potencia|watts?|watt)\b/, ["potencia", "watt", "watts"]],
  [/\b(voltaje|voltios?|volts?)\b/, ["voltaje", "volt", "v"]],
  [/\b(amperaje|amperios?|amps?)\b/, ["amperaje", "amperio", "amp"]],
  [/\b(bluetooth|bt)\b/, ["bluetooth"]],
  [/\b(wifi|wi fi|inalambrico)\b/, ["wifi", "wi fi", "inalambrico"]],
  [/\b(resistente|agua|impermeable|ipx|ip67|ip68)\b/, ["agua", "ipx", "ip67", "ip68", "resistencia", "impermeable"]],
  [/\b(peso|pesa)\b/, ["peso", "kg", "gramos"]],
  [/\b(medidas|dimension|dimensiones|tamano)\b/, ["medida", "dimension", "tamano"]],
  [/\b(carga|cargador|usb|tipo c|type c)\b/, ["carga", "cargador", "usb", "tipo c", "type c"]],
  [/\b(garantia)\b/, ["garantia"]],
  [/\b(material|fabricado|hecho de)\b/, ["material"]],
  [/\b(color|colores)\b/, ["color"]],
  [/\b(compatible|compatibilidad|funciona con)\b/, ["compatible", "compatibilidad"]],
  [/\b(capacidad|litros?|gb|tb|mah)\b/, ["capacidad", "litro", "gb", "tb", "mah"]],
  [/\b(alcance|distancia|metros)\b/, ["alcance", "distancia", "metro"]],
  [/\b(frecuencia|hz|khz|mhz)\b/, ["frecuencia", "hz", "khz", "mhz"]],
  [/\b(conector|conectores|puerto|puertos|entrada|entradas|salida|salidas)\b/, ["conector", "puerto", "entrada", "salida"]],
  [/\b(incluye|incluido|accesorio|accesorios|que trae)\b/, ["incluye", "incluido", "accesorio", "contenido"]],
];

function wantedSpecificationTerms(question: string) {
  const normalizedQuestion = normalize(question);
  const wantedTerms = new Set<string>();

  for (const [pattern, terms] of SPEC_ALIASES) {
    if (pattern.test(normalizedQuestion)) {
      terms.forEach((term) => wantedTerms.add(term));
    }
  }

  if (wantedTerms.size === 0) {
    normalizedQuestion
      .split(" ")
      .filter((token) => token.length >= 4)
      .forEach((token) => wantedTerms.add(token));
  }

  return wantedTerms;
}

function scoreSpecification(
  specification: { name: string; value: string },
  wantedTerms: Set<string>,
) {
  const name = normalize(specification.name);
  const value = normalize(specification.value);
  let score = 0;

  for (const term of wantedTerms) {
    if (name === term) score += 12;
    else if (name.includes(term)) score += 8;
    if (value.includes(term)) score += 2;
  }

  return score;
}

function relevantFallbackSnippet(
  product: RouterV2ProductInformation,
  wantedTerms: Set<string>,
) {
  const sources = [
    product.descriptionShort,
    product.descriptionFull,
    product.description,
    product.technicalSpecs,
  ].filter((value): value is string => Boolean(value?.trim()));

  const parts = sources
    .flatMap((value) =>
      value
        .split(/\r?\n|(?<=[.!?;])\s+/)
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .filter((part) => {
      const normalizedPart = normalize(part);
      return [...wantedTerms].some((term) => normalizedPart.includes(term));
    })
    .slice(0, 3);

  if (parts.length === 0) return null;

  const value = parts.join(" ").slice(0, 700).trim();
  return value ? { name: "Ficha técnica", value } : null;
}

export function findRouterV2ProductSpecification(
  product: RouterV2ProductInformation,
  question: string,
) {
  const normalizedQuestion = normalize(question);
  if (!normalizedQuestion) return null;

  const wantedTerms = wantedSpecificationTerms(question);
  if (wantedTerms.size === 0) return null;

  const best = product.specifications
    .map((specification) => ({
      specification,
      score: scoreSpecification(specification, wantedTerms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (best) return best.specification;

  return relevantFallbackSnippet(product, wantedTerms);
}
