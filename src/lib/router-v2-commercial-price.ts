import { prisma } from "@/lib/prisma";

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export async function resolveCommercialPrice(
  productCode: string,
  quantity: number,
) {
  const code = productCode.trim();

  if (!code) {
    throw new Error("productCode is required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  const product = await prisma.product.findFirst({
    where: {
      code,
      isVisible: true,
      stockUnits: {
        gt: 0,
      },
    },

    select: {
      code: true,
      name: true,
      brand: true,
      category: true,
      unitPrice: true,
      wholesalePrice: true,
      wholesaleMinQty: true,
    },
  });

  if (!product) {
    return {
      status: "NOT_FOUND" as const,
      productCode: code,
      quantity,
    };
  }

  const regularPrice = Number(product.unitPrice);

  const wholesalePrice =
    product.wholesalePrice === null
      ? null
      : Number(product.wholesalePrice);

  const appliesWholesale =
    wholesalePrice !== null &&
    product.wholesaleMinQty > 0 &&
    quantity >= product.wholesaleMinQty;

  const appliedUnitPrice =
    appliesWholesale
      ? wholesalePrice
      : regularPrice;

  return {
    status: "READY" as const,

    product: {
      code: product.code,
      name: product.name,
      brand: product.brand,
      category: product.category,
    },

    quantity,

    priceTier:
      appliesWholesale
        ? "MAYORISTA" as const
        : "UNITARIO" as const,

    unitPrice: money(appliedUnitPrice),
    total: money(appliedUnitPrice * quantity),

    regularPrice: money(regularPrice),
    wholesalePrice:
      wholesalePrice === null
        ? null
        : money(wholesalePrice),

    wholesaleMinQty: product.wholesaleMinQty,
  };
}
