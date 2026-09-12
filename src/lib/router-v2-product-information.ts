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

export function findRouterV2ProductSpecification(
  product: RouterV2ProductInformation,
  question: string,
) {
  const normalizedQuestion = normalize(question);
  if (!normalizedQuestion) return null;

  const aliases: Array<[RegExp, string[]]> = [
    [/\b(bateria|autonomia|duracion|horas)\b/, ["bateria", "autonomia", "duracion"]],
    [/\b(potencia|watts|watt)\b/, ["potencia", "watt", "watts"]],
    [/\b(bluetooth|bt)\b/, ["bluetooth"]],
    [/\b(resistente|agua|ipx|ip67|ip68)\b/, ["agua", "ip", "resistencia"]],
    [/\b(peso|pesa)\b/, ["peso"]],
    [/\b(medidas|dimension|dimensiones|tamano)\b/, ["medida", "dimension", "tamano"]],
    [/\b(carga|cargador|usb|tipo c|type c)\b/, ["carga", "usb", "tipo c", "type c"]],
    [/\b(garantia)\b/, ["garantia"]],
  ];

  const wantedTerms = new Set<string>();

  for (const [pattern, terms] of aliases) {
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

  for (const specification of product.specifications) {
    const haystack = normalize(`${specification.name} ${specification.value}`);
    if ([...wantedTerms].some((term) => haystack.includes(term))) {
      return specification;
    }
  }

  const fallbackText = [
    product.descriptionShort,
    product.descriptionFull,
    product.description,
    product.technicalSpecs,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (
    fallbackText &&
    [...wantedTerms].some((term) => normalize(fallbackText).includes(term))
  ) {
    return { name: "Ficha técnica", value: fallbackText };
  }

  return null;
}
