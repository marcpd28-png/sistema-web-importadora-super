"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CatalogProduct } from "@/lib/store";
import type { SaleMode } from "@/lib/pricing";
import { getPublicProductName } from "@/lib/product-name";

export type CartItem = Pick<
  CatalogProduct,
  | "id"
  | "code"
  | "name"
  | "unitLabel"
  | "unitPrice"
  | "wholesalePrice"
  | "wholesaleMinQty"
  | "boxPrice"
  | "unitsPerBox"
  | "stockUnits"
> & {
  key: string;
  imageAlt?: string | null;
  imageUrl?: string | null;
  mode: SaleMode;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  addItem: (product: CatalogProduct, mode: SaleMode, quantity?: number) => void;
  reconcileProducts: (products: CatalogProduct[]) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function getMaxQuantity(product: CatalogProduct, mode: SaleMode) {
  if (mode === "box") {
    if (!product.unitsPerBox || product.unitsPerBox <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(product.stockUnits / product.unitsPerBox));
  }

  return product.stockUnits;
}

export function reconcileCartItems(
  items: CartItem[],
  products: CatalogProduct[],
) {
  const productsByCode = new Map(
    products.map((product) => [product.code, product]),
  );

  return items.flatMap((item) => {
    const product = productsByCode.get(item.code);

    if (!product || !product.isVisible || product.stockUnits <= 0) {
      return [];
    }

    const maxQuantity = getMaxQuantity(product, item.mode);

    if (maxQuantity <= 0) {
      return [];
    }

    return [
      {
        ...item,
        boxPrice: product.boxPrice,
        id: product.id,
        imageAlt:
          product.primaryMedia?.altText ??
          getPublicProductName(product.name),
        imageUrl: product.primaryMedia?.url ?? product.imageUrl,
        name: getPublicProductName(product.name),
        quantity: Math.min(item.quantity, maxQuantity),
        stockUnits: product.stockUnits,
        unitLabel: product.unitLabel,
        unitPrice: product.unitPrice,
        unitsPerBox: product.unitsPerBox,
        wholesaleMinQty: product.wholesaleMinQty,
        wholesalePrice: product.wholesalePrice,
      },
    ];
  });
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      addItem: (product, mode, quantity = 1) =>
        set((state) => {
          const key = `${product.id}:${mode}`;
          const maxQuantity = getMaxQuantity(product, mode);
          const safeQuantity = Math.max(1, Math.floor(quantity));

          if (maxQuantity <= 0) {
            return state;
          }

          const existing = state.items.find((item) => item.key === key);

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.key === key
                  ? {
                      ...item,
                      boxPrice: product.boxPrice,
                      code: product.code,
                      imageAlt: product.primaryMedia?.altText ?? product.name,
                      imageUrl: product.primaryMedia?.url ?? product.imageUrl,
                      name: getPublicProductName(product.name),
                      quantity: Math.min(item.quantity + safeQuantity, maxQuantity),
                      stockUnits: product.stockUnits,
                      unitLabel: product.unitLabel,
                      unitPrice: product.unitPrice,
                      unitsPerBox: product.unitsPerBox,
                      wholesaleMinQty: product.wholesaleMinQty,
                      wholesalePrice: product.wholesalePrice,
                    }
                  : item,
              ),
            };
          }

          return {
            items: [
              ...state.items,
              {
                key,
                id: product.id,
                code: product.code,
                name: getPublicProductName(product.name),
                unitLabel: product.unitLabel,
                unitPrice: product.unitPrice,
                wholesalePrice: product.wholesalePrice,
                wholesaleMinQty: product.wholesaleMinQty,
                boxPrice: product.boxPrice,
                unitsPerBox: product.unitsPerBox,
                stockUnits: product.stockUnits,
                imageAlt: product.primaryMedia?.altText ?? getPublicProductName(product.name),
                imageUrl: product.primaryMedia?.url ?? product.imageUrl,
                mode,
                quantity: Math.min(safeQuantity, maxQuantity),
              },
            ],
          };
        }),
      reconcileProducts: (products) =>
        set((state) => ({
          items: reconcileCartItems(state.items, products),
        })),
      setQuantity: (key, quantity) =>
        set((state) => ({
          items: state.items
            .map((item) => {
              if (item.key !== key) {
                return item;
              }

              const maxQuantity =
                item.mode === "box" && item.unitsPerBox
                  ? Math.floor(item.stockUnits / item.unitsPerBox)
                  : item.stockUnits;

              return {
                ...item,
                quantity: Math.min(Math.max(quantity, 0), maxQuantity),
              };
            })
            .filter((item) => item.quantity > 0),
        })),
      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter((item) => item.key !== key),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "importadora-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export function rehydrateCartStore() {
  if (useCartStore.persist.hasHydrated()) {
    return Promise.resolve();
  }

  return useCartStore.persist.rehydrate();
}

export function isCartStoreHydrated() {
  return useCartStore.persist.hasHydrated();
}
