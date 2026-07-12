import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileCartItems,
  type CartItem,
} from "@/components/catalog/cart-store";
import type { CatalogProduct } from "@/lib/store";

function buildProduct(
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id: "product-1",
    code: "SKU-1",
    slug: "product-1",
    name: "Producto actualizado",
    description: null,
    technicalSpecs: null,
    brand: null,
    category: null,
    categoryId: null,
    imageUrl: "/uploads/products/new.webp",
    sourceImageUrl: "https://erp.example.com/photo.jpg",
    localImageUrl: "/uploads/products/new.webp",
    media: [],
    primaryMedia: {
      id: "local-image",
      type: "IMAGE",
      url: "/uploads/products/new.webp",
      altText: "Producto actualizado",
      sortOrder: -1,
    },
    unitLabel: "unidad",
    unitPrice: 25,
    wholesalePrice: 20,
    wholesaleMinQty: 3,
    boxPrice: null,
    unitsPerBox: null,
    stockUnits: 3,
    isVisible: true,
    isFeatured: false,
    syncEnabled: true,
    hasPhoto: true,
    lastSyncedAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

const staleItem: CartItem = {
  key: "product-1:unit",
  id: "product-1",
  code: "SKU-1",
  name: "Producto anterior",
  unitLabel: "unidad",
  unitPrice: 10,
  wholesalePrice: 9,
  wholesaleMinQty: 5,
  boxPrice: null,
  unitsPerBox: null,
  stockUnits: 20,
  imageAlt: "Producto anterior",
  imageUrl: "/old.webp",
  mode: "unit",
  quantity: 8,
};

test("reconcilia precio, stock, cantidad e imagen del carrito", () => {
  const [item] = reconcileCartItems([staleItem], [buildProduct()]);

  assert.equal(item.unitPrice, 25);
  assert.equal(item.wholesalePrice, 20);
  assert.equal(item.stockUnits, 3);
  assert.equal(item.quantity, 3);
  assert.equal(item.imageUrl, "/uploads/products/new.webp");
  assert.equal(item.name, "Producto actualizado");
});

test("retira del carrito productos agotados o invisibles", () => {
  assert.deepEqual(
    reconcileCartItems(
      [staleItem],
      [buildProduct({ isVisible: false, stockUnits: 0 })],
    ),
    [],
  );
});
