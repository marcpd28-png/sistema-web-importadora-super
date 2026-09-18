import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { hasRealProductPhoto } from "@/lib/product-media";
import { preserveProductCoverInGallery } from "@/lib/product-editor-media";
import { buildMissingProductPhotoWhere, buildProductsNeedingPhotoWhere, buildRealProductPhotoSql, buildRealProductPhotoWhere } from "@/lib/product-photo-policy";
import { buildSellableProductWhere, mapProduct } from "@/lib/store-shared";

test("PostgreSQL: publicación, pendientes y SQL coinciden antes y después de sincronizar", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const prefix = `photo-test-${randomUUID().slice(0, 8)}`;
  const fixtures = [
    { name: "null", photo: false, stock: 8, visible: true },
    { name: "empty", photo: false, stock: 3, visible: true, imageUrl: "", localImageUrl: "" },
    { name: "spaces", photo: false, stock: 3, visible: true, imageUrl: " \t\n", localImageUrl: " " },
    { name: "generic", photo: false, stock: 4, visible: true, imageUrl: "https://erp.test/IMAGEN-NO-DISPONIBLE.jpg?v=2" },
    { name: "local-generic", photo: false, stock: 4, visible: true, localImageUrl: "/uploads/placeholder.webp" },
    { name: "gallery-generic", photo: false, stock: 5, visible: true, media: { type: "IMAGE" as const, url: "/uploads/sin-foto.webp" } },
    { name: "video", photo: false, stock: 7, visible: true, media: { type: "VIDEO" as const, url: "https://video.test/movie.mp4" } },
    { name: "hidden", photo: false, stock: 7, visible: false },
    { name: "empty-stock", photo: false, stock: 0, visible: true },
    { name: "negative-stock", photo: false, stock: -1, visible: true },
    { name: "image", photo: true, stock: 8, visible: true, imageUrl: "https://test.example/real.jpg" },
    { name: "local", photo: true, stock: 8, visible: true, localImageUrl: "/uploads/real.webp" },
    { name: "gallery", photo: true, stock: 8, visible: true, media: { type: "IMAGE" as const, url: "/uploads/real.webp" } },
    { name: "hidden-with-photo", photo: true, stock: 8, visible: false, imageUrl: "/real.webp" },
    { name: "fallback", photo: true, stock: 8, visible: true, imageUrl: "/real.webp", localImageUrl: "/no-image.webp" },
  ];
  try {
    await db.$transaction(async (tx) => {
      for (const fixture of fixtures) {
        await tx.product.create({ data: {
          code: `${prefix}-${fixture.name}`, slug: `${prefix}-${fixture.name}`, name: fixture.name,
          unitPrice: 10, stockUnits: fixture.stock, isVisible: fixture.visible,
          imageUrl: fixture.imageUrl, localImageUrl: fixture.localImageUrl,
          media: fixture.media ? { create: fixture.media } : undefined,
        } });
      }
      const scope = { code: { startsWith: prefix } };
      const names = async (where: Prisma.ProductWhereInput) => (await tx.product.findMany({ where: { AND: [scope, where] }, select: { name: true } })).map((row) => row.name).sort();
      const expected = (filter: (fixture: typeof fixtures[number]) => boolean) => fixtures.filter(filter).map((fixture) => fixture.name).sort();
      assert.deepEqual(await names(buildRealProductPhotoWhere()), expected((item) => item.photo));
      assert.deepEqual(await names(buildMissingProductPhotoWhere()), expected((item) => !item.photo));
      assert.deepEqual(await names(buildProductsNeedingPhotoWhere()), expected((item) => !item.photo && item.stock > 0));
      assert.deepEqual(await names(buildSellableProductWhere()), expected((item) => item.photo && item.visible));
      const sqlRows = await tx.$queryRaw<Array<{ name: string; photo: boolean }>>(Prisma.sql`
        SELECT p.name, ${buildRealProductPhotoSql()} AS photo FROM "Product" p WHERE p.code LIKE ${`${prefix}%`}
      `);
      assert.deepEqual(sqlRows.filter((row) => row.photo).map((row) => row.name).sort(), expected((item) => item.photo));
      const rows = await tx.product.findMany({ where: scope, include: { media: true } });
      for (const row of rows) {
        assert.equal(hasRealProductPhoto(row), fixtures.find((item) => item.name === row.name)?.photo, row.name);
        assert.equal(mapProduct(row).hasPhoto, hasRealProductPhoto(row));
        assert.equal(Boolean(mapProduct(row).primaryMedia), hasRealProductPhoto(row));
      }

      // All sync modes can set the flag back to true: it must not bypass the photo requirement.
      const code = `${prefix}-null`;
      await tx.product.update({ where: { code }, data: { stockUnits: 20, isVisible: true, syncEnabled: true } });
      assert.equal(await tx.product.count({ where: { AND: [{ code }, buildSellableProductWhere()] } }), 0);
      assert.equal(await tx.product.count({ where: { AND: [{ code }, buildProductsNeedingPhotoWhere()] } }), 1);

      await tx.product.update({ where: { code }, data: { media: { create: preserveProductCoverInGallery("/manual.webp", []) } } });
      assert.equal(await tx.product.count({ where: { AND: [{ code }, buildSellableProductWhere()] } }), 1);
      assert.equal(await tx.product.count({ where: { AND: [{ code }, buildProductsNeedingPhotoWhere()] } }), 0);
      await tx.product.update({ where: { code }, data: { imageUrl: null, localImageUrl: null, isVisible: true, stockUnits: 30 } });
      assert.equal(await tx.product.count({ where: { AND: [{ code }, buildSellableProductWhere()] } }), 1);
      await tx.product.update({ where: { code }, data: { media: { deleteMany: {} } } });
      assert.equal(await tx.product.count({ where: { AND: [{ code }, buildSellableProductWhere()] } }), 0);
      assert.equal(await tx.product.count({ where: { AND: [{ code }, buildProductsNeedingPhotoWhere()] } }), 1);
      // Keep the test database clean even after a successful run.
      await tx.product.deleteMany({ where: scope });
    }, { timeout: 30_000 });
  } finally {
    await db.$disconnect();
  }
});
