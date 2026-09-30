import { Prisma } from "@prisma/client";
import { GENERIC_PRODUCT_PHOTO_MARKERS } from "@/lib/product-media";

type PhotoField = "imageUrl" | "localImageUrl" | "url";

function realPhotoFieldWhere(field: PhotoField) {
  return {
    AND: [
      { OR: ["https://", "http://", "/"].map((prefix) => ({
        [field]: { startsWith: prefix, mode: "insensitive" },
      })) },
      ...GENERIC_PRODUCT_PHOTO_MARKERS.map((marker) => ({
        NOT: { [field]: { contains: marker, mode: "insensitive" } },
      })),
    ],
  };
}

export function buildRealProductPhotoWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      realPhotoFieldWhere("localImageUrl"),
      realPhotoFieldWhere("imageUrl"),
      { media: { some: { type: "IMAGE", ...realPhotoFieldWhere("url") } } },
    ],
  };
}

export function buildMissingProductPhotoWhere(): Prisma.ProductWhereInput {
  // Explicit null branches keep this the complement of the photo filter even
  // with SQL's three-valued logic for nullable cover fields.
  return {
    AND: [
      { OR: [{ localImageUrl: null }, { NOT: realPhotoFieldWhere("localImageUrl") }] },
      { OR: [{ imageUrl: null }, { NOT: realPhotoFieldWhere("imageUrl") }] },
      { media: { none: { type: "IMAGE", ...realPhotoFieldWhere("url") } } },
    ],
  };
}

export function buildProductsNeedingPhotoWhere(): Prisma.ProductWhereInput {
  // Do not filter on isVisible: synced, manually hidden and newly created
  // products all need attention when stock is available without a photo.
  return { stockUnits: { gt: 0 }, AND: [buildMissingProductPhotoWhere()] };
}

function realPhotoSql(column: Prisma.Sql) {
  return Prisma.sql`COALESCE((
    (${column} ILIKE 'https://%' OR ${column} ILIKE 'http://%' OR ${column} LIKE '/%')
    AND ${Prisma.join(GENERIC_PRODUCT_PHOTO_MARKERS.map((marker) =>
      Prisma.sql`${column} NOT ILIKE ${`%${marker}%`}`,
    ), " AND ")}
  ), false)`;
}

// Queries using this helper alias Product as p and ProductMedia as pm.
export function buildRealProductPhotoSql() {
  return Prisma.sql`(
    ${realPhotoSql(Prisma.sql`p."localImageUrl"`)}
    OR ${realPhotoSql(Prisma.sql`p."imageUrl"`)}
    OR EXISTS (
      SELECT 1 FROM "ProductMedia" pm
      WHERE pm."productId" = p.id AND pm.type = 'IMAGE'
        AND ${realPhotoSql(Prisma.sql`pm.url`)}
    )
  )`;
}
