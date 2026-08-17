import { slugify } from "@/lib/utils";
import { inferStoreCategoryName } from "@/lib/product-category-classifier";
import type {
  FacturadorBrand,
  FacturadorCategory,
  FacturadorProduct,
  FacturadorRecord,
  ProductMapResult,
} from "@/lib/facturador/types";

type LookupMaps = {
  categories: Map<string, string>;
  brands: Map<string, string>;
};

const UNIT_LABELS: Record<string, string> = {
  NIU: "unidad",
  ZZ: "servicio",
  KGM: "kg",
  MTR: "metro",
  LTR: "litro",
};

const DEFAULT_WHOLESALE_MIN_QTY = 3;
const MAX_PRODUCT_SLUG_LENGTH = 140;

export function buildCategoryLookup(categories: FacturadorCategory[]) {
  return buildLookup(categories);
}

export function buildBrandLookup(brands: FacturadorBrand[]) {
  return buildLookup(brands);
}

export function mapFacturadorProduct(
  product: FacturadorProduct,
  lookups: LookupMaps,
  source: string,
  syncedAt = new Date(),
): ProductMapResult {
  const externalId = getFirstString(product, ["id", "item_id", "external_id"]);
  const externalCode = getFirstString(product, [
    "internal_id",
    "item_code",
    "barcode",
    "item_code_gs1",
    "code",
  ]);
  const code = externalCode || (externalId ? `EXT-${externalId}` : null);

  if (!externalId && !code) {
    return {
      ok: false,
      reason: "Producto sin ID externo ni codigo identificable.",
      externalId: null,
    };
  }

  if (!code) {
    return {
      ok: false,
      reason: "Producto sin codigo usable para la tienda.",
      externalId,
    };
  }

  const stableExternalId = externalId ?? code;
  const name = getFirstString(product, ["description", "name", "second_name"]);

  if (!name || name.length < 3) {
    return {
      ok: false,
      reason: "Producto sin nombre valido.",
      externalId: externalId ?? code,
    };
  }

  const topLevelSalePrice = getFirstNumber(product, [
    "sale_unit_price",
    "unit_price",
    "price",
    "sale_price",
  ]);
  const unitPrice = getUnitPrice(product) ?? topLevelSalePrice;

  if (!unitPrice || unitPrice <= 0) {
    return {
      ok: false,
      reason: "Producto sin precio de venta valido.",
      externalId: externalId ?? code,
    };
  }

  const categoryName =
    resolveName(product, lookups.categories, "category") ??
    inferStoreCategoryName({ code, name });
  const brandName = resolveName(product, lookups.brands, "brand");
  const imageUrl = getFirstString(product, ["image_url", "image", "photo_url", "photo"]);
  const stockUnits = getFirstNumber(product, ["stock", "stock_units", "quantity"]) ?? 0;
  const unitTypeId = getFirstString(product, ["unit_type_id", "unit_type"]);
  const unitsPerBox = getUnitsPerBox(product);
  const wholesalePrice = getWholesalePrice(product, unitPrice);
  const boxPrice = getBoxPrice(product);
  const normalizedStockUnits = Math.max(0, Math.floor(stockUnits));

  return {
    ok: true,
    categoryName,
    product: {
      code: code.slice(0, 64),
      slug: buildProductSlug(name, code, stableExternalId),
      name: name.slice(0, 180),
      description: getFirstString(product, ["description", "full_description", "details"]) ?? null,
      brand: brandName,
      category: categoryName,
      categoryId: null,
      imageUrl: imageUrl && isValidHttpUrl(imageUrl) ? imageUrl : null,
      unitLabel: unitTypeId ? UNIT_LABELS[unitTypeId] ?? unitTypeId.toLowerCase() : "unidad",
      unitPrice,
      wholesalePrice,
      wholesaleMinQty: getWholesaleMinQty(product) ?? DEFAULT_WHOLESALE_MIN_QTY,
      boxPrice,
      unitsPerBox,
      stockUnits: normalizedStockUnits,
      isVisible: normalizedStockUnits > 0,
      isFeatured: false,
      externalSource: source,
      externalId: stableExternalId.slice(0, 120),
      externalCode: externalCode?.slice(0, 120) ?? code.slice(0, 120),
      syncEnabled: true,
      lastSyncedAt: syncedAt,
    },
  };
}

function buildProductSlug(name: string, code: string, externalId: string) {
  const suffix = slugify(`${code}-${externalId}`).slice(0, 72);
  const base = slugify(name);
  const fullSlug = [base, suffix].filter(Boolean).join("-");

  if (fullSlug.length <= MAX_PRODUCT_SLUG_LENGTH) {
    return fullSlug;
  }

  if (!suffix) {
    return base.slice(0, MAX_PRODUCT_SLUG_LENGTH);
  }

  const maxBaseLength = Math.max(0, MAX_PRODUCT_SLUG_LENGTH - suffix.length - 1);
  const trimmedBase = base.slice(0, maxBaseLength).replace(/-+$/g, "");

  return trimmedBase
    ? `${trimmedBase}-${suffix}`
    : suffix.slice(0, MAX_PRODUCT_SLUG_LENGTH);
}

function buildLookup(records: FacturadorRecord[]) {
  const lookup = new Map<string, string>();

  for (const record of records) {
    const name = getFirstString(record, ["name", "description", "label"]);

    if (!name) {
      continue;
    }

    for (const key of ["id", "category_id", "brand_id", "value", "code"]) {
      const value = getFirstString(record, [key]);

      if (value) {
        lookup.set(value, name);
      }
    }
  }

  return lookup;
}

function resolveName(product: FacturadorProduct, lookup: Map<string, string>, field: "category" | "brand") {
  const direct = getFirstString(product, [field, `${field}_name`, `${field}_description`]);

  if (direct) {
    return direct.slice(0, 120);
  }

  const nested = product[field];

  if (isRecord(nested)) {
    const nestedName = getFirstString(nested, ["name", "description", "label"]);

    if (nestedName) {
      return nestedName.slice(0, 120);
    }
  }

  const id = getFirstString(product, [`${field}_id`]);
  return id ? lookup.get(id)?.slice(0, 120) ?? null : null;
}

function getUnitsPerBox(product: FacturadorProduct) {
  const direct = getFirstNumber(product, ["units_per_box", "quantity_unit", "unit_quantity"]);

  if (direct && direct > 0) {
    return Math.floor(direct);
  }

  const unitTypes = product.item_unit_types;

  if (!Array.isArray(unitTypes)) {
    return null;
  }

  for (const unitType of unitTypes) {
    if (!isRecord(unitType)) {
      continue;
    }

    const description = normalizeLookupText(
      getFirstString(unitType, ["description", "unit_type_id", "name"]) ?? "",
    );
    const descriptionQuantity = description.match(/(?:x|por|caja)\s*(\d{2,})\b/);

    if (descriptionQuantity) {
      return Number(descriptionQuantity[1]);
    }

    const quantity = getFirstNumber(unitType, ["quantity_unit", "quantity", "units"]);

    if (quantity && quantity > 1) {
      return Math.floor(quantity);
    }
  }

  return null;
}

function getUnitPrice(product: FacturadorProduct) {
  const unitType = findUnitType(product, /^(unidad|unit|unid|niu)$/);
  return unitType ? getUnitTypePrice(unitType) : null;
}

function getWholesalePrice(product: FacturadorProduct, unitPrice: number) {
  const wholesaleUnit = findUnitType(product, /mayor|mayorista|wholesale/);

  if (wholesaleUnit) {
    const price = getUnitTypePrice(wholesaleUnit);

    if (price && price > 0 && price <= unitPrice) {
      return price;
    }
  }

  const direct = getFirstNumber(product, [
    "wholesale_price",
    "sale_wholesale_price",
    "price_wholesale",
    "sale_unit_price_2",
    "sale_unit_price2",
  ]);

  if (direct && direct > 0 && direct <= unitPrice) {
    return direct;
  }

  const unitTypes = product.item_unit_types;

  if (!Array.isArray(unitTypes)) {
    return null;
  }

  const candidates = unitTypes
    .filter(isRecord)
    .map(getUnitTypePrice)
    .filter((value): value is number => Boolean(value && value > 0 && value <= unitPrice));

  return candidates.length ? Math.min(...candidates) : null;
}

function getWholesaleMinQty(product: FacturadorProduct) {
  const direct = getFirstNumber(product, [
    "wholesale_min_qty",
    "minimum_wholesale_quantity",
    "min_wholesale_qty",
  ]);

  if (direct && direct >= 2) {
    return Math.floor(direct);
  }

  const wholesaleUnit = findUnitType(product, /mayor|mayorista|wholesale/);
  const quantity = wholesaleUnit
    ? getFirstNumber(wholesaleUnit, ["quantity_unit", "quantity", "units"])
    : null;

  return quantity && quantity >= 2 ? Math.floor(quantity) : null;
}

function getBoxPrice(product: FacturadorProduct) {
  const direct = getFirstNumber(product, [
    "box_price",
    "sale_box_price",
    "package_price",
    "price_box",
  ]);

  if (direct && direct > 0) {
    return direct;
  }

  const boxUnit = findUnitType(product, /caja|box|paquete|docena|pack|cajon/);
  const unitPrice = boxUnit ? getUnitTypePrice(boxUnit) : null;
  const unitsPerBox = getUnitsPerBox(product);

  if (!unitPrice) {
    return null;
  }

  return unitsPerBox && unitsPerBox > 1 ? Number((unitPrice * unitsPerBox).toFixed(2)) : unitPrice;
}

function normalizeLookupText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findUnitType(product: FacturadorProduct, pattern: RegExp) {
  const unitTypes = product.item_unit_types;

  if (!Array.isArray(unitTypes)) {
    return null;
  }

  return (
    unitTypes.filter(isRecord).find((unitType) => {
      const description = normalizeLookupText(
        getFirstString(unitType, ["description", "unit_type_id", "name"]) ?? "",
      );
      return pattern.test(description);
    }) ?? null
  );
}

function getUnitTypePrice(unitType: FacturadorRecord) {
  const defaultIndex = getFirstNumber(unitType, ["price_default", "default_price"]);

  if (defaultIndex && Number.isInteger(defaultIndex)) {
    const defaultPrice = getFirstNumber(unitType, [
      `price${defaultIndex}`,
      `price_${defaultIndex}`,
    ]);

    if (defaultPrice && defaultPrice > 0) {
      return defaultPrice;
    }
  }

  return getFirstNumber(unitType, [
    "price2",
    "price_2",
    "price1",
    "price_1",
    "price3",
    "price_3",
    "sale_unit_price",
    "unit_price",
    "price",
  ]);
}

function getFirstString(record: FacturadorRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getFirstNumber(record: FacturadorRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is FacturadorRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
