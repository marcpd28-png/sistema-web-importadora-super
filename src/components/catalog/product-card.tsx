"use client";
import { variantColor } from "@/lib/storefront-taxonomy";

import { CatalogPrefetchLink } from "@/components/catalog/catalog-prefetch-link";
import { useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { trackAddToCart } from "@/lib/analytics";
import { isCartStoreHydrated, rehydrateCartStore, useCartStore } from "@/components/catalog/cart-store";
import { getPublicProductName } from "@/lib/product-name";
import type { CatalogProduct } from "@/lib/store";
import { ProductMediaFrame } from "@/components/catalog/product-media-frame";
import { announceCartAddition } from "@/components/catalog/cart-feedback";

type ProductCardProps = {
  className?: string;
  product: CatalogProduct;
};

export function ProductCard({ product: initialProduct, className = "" }: ProductCardProps) {
  const [selectedId, setSelectedId] = useState(initialProduct.id);
  const product = initialProduct.colorVariants?.find(item => item.id === selectedId) ?? initialProduct;
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
    announceCartAddition({ productName: displayName, quantity: requestedQuantity });
    setQuantity(1);
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

        {initialProduct.colorVariants && initialProduct.colorVariants.length > 1 ? <label className="storefront-color-selector">
          <span>Color</span><select aria-label={'Color de ' + displayName} value={product.id} onChange={event => { setSelectedId(event.target.value); setQuantity(1); }}>
            {initialProduct.colorVariants.map(variant => <option key={variant.id} value={variant.id}>{variantColor(variant) ?? variant.code}{variant.stockUnits <= 0 ? " · Agotado" : ""}</option>)}
          </select>
        </label> : null}
        <div className="product-card-purchase-row">
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
          <button
            className="button button-primary product-card-add"
            disabled={product.stockUnits <= 0}
            onClick={() => void handleAddToCart()}
            title={product.stockUnits <= 0 ? "Sin stock" : "Añadir al carrito"}
            type="button"
            aria-label={product.stockUnits <= 0 ? `${displayName}: sin stock` : `Añadir ${quantity} unidad${quantity === 1 ? "" : "es"} de ${displayName} al carrito`}
          >
            <ShoppingCart size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
