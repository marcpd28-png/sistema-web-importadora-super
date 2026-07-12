"use client";

import type { CatalogProduct } from "@/lib/store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  rehydrateCartStore,
  useCartStore,
} from "@/components/catalog/cart-store";

const CATALOG_POLL_INTERVAL_MS = 10_000;

type CatalogVersionPayload = {
  version: string;
};

type CatalogProductsPayload = CatalogVersionPayload & {
  products: CatalogProduct[];
};

export function CartStoreBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let catalogVersion: string | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let requestInFlight = false;

    async function reconcileCart() {
      await rehydrateCartStore();
      const state = useCartStore.getState();
      const codes = Array.from(
        new Set(state.items.map((item) => item.code).filter(Boolean)),
      );

      if (!codes.length) {
        return null;
      }

      const response = await fetch("/api/catalog-live", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as CatalogProductsPayload;

      if (!cancelled) {
        useCartStore.getState().reconcileProducts(payload.products);
      }

      return payload.version;
    }

    async function pollCatalog() {
      if (requestInFlight || cancelled) {
        return;
      }

      requestInFlight = true;

      try {
        const response = await fetch("/api/catalog-live", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as CatalogVersionPayload;
        const versionChanged =
          catalogVersion !== null && catalogVersion !== payload.version;

        if (catalogVersion === null || versionChanged) {
          const reconciledVersion = await reconcileCart();
          catalogVersion = reconciledVersion ?? payload.version;
        }

        if (versionChanged && !cancelled) {
          router.refresh();
        }
      } catch {
        // Un fallo temporal de red no debe interrumpir el catálogo.
      } finally {
        requestInFlight = false;

        if (!cancelled) {
          timeoutId = setTimeout(
            pollCatalog,
            CATALOG_POLL_INTERVAL_MS,
          );
        }
      }
    }

    function pollWhenVisible() {
      if (document.visibilityState === "visible") {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        void pollCatalog();
      }
    }

    document.addEventListener("visibilitychange", pollWhenVisible);
    window.addEventListener("focus", pollWhenVisible);
    void pollCatalog();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", pollWhenVisible);
      window.removeEventListener("focus", pollWhenVisible);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [router]);

  return null;
}
