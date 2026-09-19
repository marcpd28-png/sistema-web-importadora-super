"use client";

import { CatalogPrefetchLink } from "@/components/catalog/catalog-prefetch-link";
import { useState } from "react";
import { Bot, Minus, Plus, ShoppingCart } from "lucide-react";
import {
  STORE_ASSISTANT_OPEN_EVENT,
  type StoreAssistantOpenDetail,
} from "@/components/catalog/assistant-events";
import { trackAddToCart } from "@/lib/analytics";
import { isCartStoreHydrated, rehydrateCartStore, useCartStore } from "@/components/catalog/cart-store";
import { getPublicProductName } from "@/lib/product-name";
import type { CatalogProduct, StoreSettingsView } from "@/lib/store";
import { ProductPriceRows } from "@/components/catalog/product-display";
import { ProductMediaFrame } from "@/components/catalog/product-media-frame";
import { formatCurrency } from "@/lib/utils";

type ProductCardProps = {
  className?: string;
  product: CatalogProduct;
  settings: StoreSettingsView;
};

export function ProductCard({ product, settings, className = "" }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const displayName = getPublicProductName(product.name);
  const [quantity, setQuantity] = useState(1);
  const handleAddToCart = async (requestedQuantity = quantity) => {
    if (!isCartStoreHydrated()) {
      await rehydrateCartStore();
    }

    addItem(product, "unit", requestedQuantity);
    trackAddToCart({
      item_id: product.code,
      item_name: displayName,
      item_brand: product.brand ?? undefined,
      item_category: product.category ?? undefined,
      price: product.unitPrice,
      quantity: requestedQuantity,
    });
    setQuantity(1);
  };

  const openAssistantForProduct = () => {
    const detail: StoreAssistantOpenDetail = {
      prompt: `Dame todas las especificaciones y detalles de este producto: ${displayName}.`,
      productContextCode: product.code,
      contextCategorySlug: null,
    };

    window.dispatchEvent(new CustomEvent(STORE_ASSISTANT_OPEN_EVENT, { detail }));
  };

  return (
    <article className={`product-card ${className}`}>
      <ProductMediaFrame displayName={displayName} href={`/producto/${product.slug}`} product={product} />

      <div className="product-body">
        <div className="stack-sm product-copy-shell">
          <div className="stack-xs product-copy">
            <h3>
              <CatalogPrefetchLink className="product-title-link" href={`/producto/${product.slug}`}>
                {displayName}
              </CatalogPrefetchLink>
            </h3>
          </div>
        </div>

        <div className="price-box product-price-box">
          <ProductPriceRows currencySymbol={settings.currencySymbol} product={product} />
        </div>

        <div className="product-card-qty-row" aria-label="Cantidad">
          <button
            aria-label="Disminuir cantidad"
            className="product-card-qty-button"
            disabled={product.stockUnits <= 0 || quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            type="button"
          >
            <Minus size={14} />
          </button>
          <strong className="product-card-qty-value">{quantity}</strong>
          <button
            aria-label="Aumentar cantidad"
            className="product-card-qty-button"
            disabled={product.stockUnits <= 0 || quantity >= product.stockUnits}
            onClick={() => setQuantity((value) => Math.min(product.stockUnits, value + 1))}
            type="button"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="product-actions product-actions-dual">
          <button
            className="button button-primary"
            disabled={product.stockUnits <= 0}
            onClick={() => void handleAddToCart()}
            title={product.stockUnits <= 0 ? "Sin stock" : "Añadir al carrito"}
            type="button"
            aria-label={product.stockUnits <= 0 ? "Sin stock" : "Añadir al carrito"}
          >
            <ShoppingCart size={16} />
            <span className="product-card-action-label">{product.stockUnits <= 0 ? "Sin stock" : "Añadir"}</span>
          </button>
          <button className="button button-secondary" onClick={openAssistantForProduct} type="button">
            <Bot size={16} />
            <span className="product-card-action-label">Consultar</span>
          </button>
        </div>

        <div className="product-card-mobile-summary">
          <div className="product-card-mobile-prices">
            <div aria-label={`Precio unitario: ${formatCurrency(product.unitPrice, settings.currencySymbol)}`}>
              <span>Un.</span>
              <strong>{formatCurrency(product.unitPrice, settings.currencySymbol)}</strong>
            </div>
            <div className="is-wholesale" aria-label={`Precio mayorista desde ${product.wholesaleMinQty} unidades: ${formatCurrency(product.wholesalePrice ?? product.unitPrice, settings.currencySymbol)}`}>
              <span>{product.wholesaleMinQty}+</span>
              <strong>{formatCurrency(product.wholesalePrice ?? product.unitPrice, settings.currencySymbol)}</strong>
            </div>
          </div>
          <button
            className="button button-primary product-card-mobile-add"
            disabled={product.stockUnits <= 0}
            onClick={() => void handleAddToCart(1)}
            aria-label={product.stockUnits <= 0 ? `${displayName}: sin stock` : `Añadir una unidad de ${displayName} al carrito`}
            title={product.stockUnits <= 0 ? "Sin stock" : "Añadir una unidad al carrito"}
            type="button"
          >
            <ShoppingCart size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
