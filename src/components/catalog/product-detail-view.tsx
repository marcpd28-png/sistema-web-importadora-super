"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CircleX, ImageIcon, Minus, Plus, ShoppingCart, ZoomIn } from "lucide-react";
import { CartStoreBootstrap } from "@/components/catalog/cart-store-bootstrap";
import { isCartStoreHydrated, rehydrateCartStore, useCartStore } from "@/components/catalog/cart-store";
import { getSafeMediaUrl, getOptimizedImageUrl } from "@/lib/media-url";
import { getPublicProductName } from "@/lib/product-name";
import type { CatalogProduct, ProductMediaView, StoreSettingsView } from "@/lib/store";
import { isGenericProductPhotoUrl } from "@/lib/store-shared";
import { formatCurrency } from "@/lib/utils";
import {
  getProductDiscountPercent,
  ProductStockChip,
} from "@/components/catalog/product-display";

type ProductDetailViewProps = {
  product: CatalogProduct;
  settings: StoreSettingsView;
};

function getFallbackMedia(product: CatalogProduct): ProductMediaView | null {
  return product.primaryMedia
    ? product.primaryMedia
    : product.localImageUrl
      ? {
          id: `${product.id}-local-image`,
          type: "IMAGE",
          url: product.localImageUrl,
          altText: product.name,
          sortOrder: 0,
        }
    : product.imageUrl && !isGenericProductPhotoUrl(product.imageUrl)
      ? {
          id: `${product.id}-legacy-image`,
          type: "IMAGE",
          url: product.imageUrl,
          altText: product.name,
          sortOrder: 0,
        }
      : null;
}

function getMediaIdentity(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized, "https://placeholder.local");
    const pathname = url.pathname.toLowerCase();
    const match = pathname.match(/^(.*?)(\.[a-z0-9]+)$/i);
    const withoutExtension = match ? match[1] : pathname;
    const extension = match?.[2] ?? "";
    const canonicalBase = withoutExtension
      .replace(/-(mobile|thumb|thumbnail|small|sm|preview|desktop|full|sq|square|lg|large|medium|md)$/i, "")
      .replace(/@[0-9.]+x$/i, "");

    return `${url.hostname}${canonicalBase}${extension}`.toLowerCase();
  } catch {
    return normalized
      .toLowerCase()
      .split("?")[0]
      .split("#")[0]
      .replace(/-(mobile|thumb|thumbnail|small|sm|preview|desktop|full|sq|square|lg|large|medium|md)(\.[a-z0-9]+)$/i, "$2")
      .replace(/@[0-9.]+x(\.[a-z0-9]+)$/i, "$1");
  }
}

export function ProductDetailView({ product, settings }: ProductDetailViewProps) {
  const addItem = useCartStore((state) => state.addItem);
  const displayName = getPublicProductName(product.name);
  const gallery = useMemo(() => {
    const media = product.media.filter((item) => !isGenericProductPhotoUrl(item.url));
    const fallback = getFallbackMedia(product);

    if (media.length) {
      return media;
    }

    return fallback ? [fallback] : [];
  }, [product]);

  const uniqueGallery = useMemo(() => {
    const seen = new Set<string>();

    return gallery.filter((item) => {
      const key = getMediaIdentity(item.url);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [gallery]);

  const uniqueImageGallery = useMemo(
    () => uniqueGallery.filter((item) => item.type === "IMAGE"),
    [uniqueGallery],
  );

  const uniqueImageIdentities = useMemo(() => {
    const seen = new Set<string>();

    return uniqueImageGallery.filter((item) => {
      const key = getMediaIdentity(item.url);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [uniqueImageGallery]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState<Record<string, boolean>>({});
  const [fullScreenMediaId, setFullScreenMediaId] = useState<string | null>(null);

  const safeActiveIndex = uniqueGallery.length
    ? Math.min(activeIndex, uniqueGallery.length - 1)
    : 0;
  const activeMedia = uniqueGallery[safeActiveIndex] ?? null;
  const activeMediaUrl = getSafeMediaUrl(activeMedia?.url);
  const activeImageIndex = uniqueImageGallery.findIndex(
    (item) => getMediaIdentity(item.url) === getMediaIdentity(activeMedia?.url),
  );
  const fullscreenMedia = fullScreenMediaId
    ? uniqueGallery.find((item) => item.id === fullScreenMediaId) ?? null
    : null;
  const fullscreenMediaUrl = getSafeMediaUrl(fullscreenMedia?.url);
  const maxQuantity = product.stockUnits;
  const safeQuantity = Math.min(Math.max(quantity, 1), Math.max(maxQuantity, 1));
  const hasWholesalePrice = Boolean(product.wholesalePrice);
  const wholesaleApplies = hasWholesalePrice && safeQuantity >= product.wholesaleMinQty;
  const discountPercent = getProductDiscountPercent(product);
  const wholesalePrice = product.wholesalePrice ?? product.unitPrice;
  const effectiveUnitPrice = wholesaleApplies ? wholesalePrice : product.unitPrice;
  const total = effectiveUnitPrice * safeQuantity;
  const wholesaleSavings =
    wholesaleApplies && product.wholesalePrice !== null
      ? (Number(product.unitPrice) - Number(product.wholesalePrice)) * safeQuantity
      : 0;
  const hasSavings = wholesaleApplies && wholesaleSavings > 0;

  useEffect(() => {
    if (!fullScreenMediaId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullScreenMediaId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [fullScreenMediaId]);

  const handleAdd = async () => {
    if (maxQuantity <= 0) {
      return;
    }

    if (!isCartStoreHydrated()) {
      await rehydrateCartStore();
    }

    addItem(product, "unit");

    for (let index = 1; index < safeQuantity; index += 1) {
      addItem(product, "unit");
    }
  };

  return (
    <section className="product-detail-layout">
      <CartStoreBootstrap />
      <div className="product-detail-main">
        <div className="product-detail-gallery-card">
          <div className="product-detail-stage">
            {activeMedia && activeMediaUrl && !(activeMedia.type === "IMAGE" && imageFailed[activeMedia.id]) ? (
              activeMedia.type === "IMAGE" ? (
                <button
                  aria-label={`Abrir imagen ampliada de ${activeMedia.altText ?? displayName}`}
                  className="product-detail-stage-media product-detail-stage-media-button"
                  onClick={() => setFullScreenMediaId(activeMedia.id)}
                  type="button"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={activeMedia.altText ?? displayName}
                    decoding="async"
                    onError={() =>
                      setImageFailed((current) => ({
                        ...current,
                        [activeMedia.id]: true,
                      }))
                    }
                    referrerPolicy="no-referrer"
                    src={getOptimizedImageUrl(activeMediaUrl, 828) ?? undefined}
                  />
                  <span className="product-detail-stage-zoom">
                    <ZoomIn size={16} />
                    Ampliar
                  </span>
                </button>
              ) : (
                <div className="product-detail-stage-media">
                  <video controls playsInline preload="metadata" src={activeMediaUrl} />
                </div>
              )
              ) : (
                <div className="product-detail-stage product-detail-stage-fallback">
                  <ImageIcon size={36} />
                <strong>Producto</strong>
                  <span>{displayName}</span>
                </div>
              )}
          </div>

          {uniqueImageIdentities.length > 1 ? (
            <div className="product-detail-thumbs">
              {uniqueImageIdentities.map((media) => {
                const mediaIndex = uniqueGallery.findIndex(
                  (item) => getMediaIdentity(item.url) === getMediaIdentity(media.url),
                );

                return (
                  <button
                    className={`product-detail-thumb ${mediaIndex === safeActiveIndex || mediaIndex === activeImageIndex ? "is-active" : ""}`}
                    key={media.id}
                    onClick={() => setActiveIndex(mediaIndex >= 0 ? mediaIndex : 0)}
                    type="button"
                  >
                    {media.type === "IMAGE" && !imageFailed[media.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={media.altText ?? `${displayName}`}
                        decoding="async"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={getOptimizedImageUrl(media.url, 96) ?? media.url}
                      />
                    ) : (
                      <span>{media.type === "VIDEO" ? "Video" : "Vista"}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <article className="panel product-detail-copy-card">
          <div className="stack-sm">
          <div className="product-detail-code-row">
            <span className="product-code">{product.code}</span>
            <ProductStockChip product={product} />
            {product.isFeatured ? (
              <span className="pill pill-accent">
                Oferta{discountPercent ? ` -${discountPercent}%` : ""}
              </span>
            ) : null}
            </div>

            <div className="stack-xs">
              <h1>{displayName}</h1>
            </div>

            {product.description ? <p className="product-detail-description">{product.description}</p> : null}

            {/* CHANGE-CODE: CAT-002 */}
            {product.technicalSpecs ? (
              <section className="product-detail-specs-card">
                <p className="eyebrow">Especificaciones técnicas</p>
                <div className="product-detail-specs">{product.technicalSpecs}</div>
              </section>
            ) : null}
          </div>

          <div className="product-detail-price-box">
            <div className="product-detail-price-main is-unitary">
              <span>Precio unitario</span>
              <strong>{formatCurrency(product.unitPrice, settings.currencySymbol)}</strong>
            </div>

            {hasWholesalePrice ? (
              <div className="product-detail-price-wholesale">
                <span>Precio mayorista a partir de {product.wholesaleMinQty} unidades</span>
                <strong>{formatCurrency(wholesalePrice, settings.currencySymbol)}</strong>
              </div>
            ) : null}

            {wholesaleApplies ? (
              <div className="product-detail-price-lines">
                {hasSavings ? (
                  <div className="product-detail-price-savings">
                    <span>Ahorras por mayorista</span>
                    <strong>{formatCurrency(wholesaleSavings, settings.currencySymbol)}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="product-detail-buybox">
            <div className="product-detail-qty-row">
              <div className="product-detail-qty-control">
                <button
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  type="button"
                >
                  <Minus size={16} />
                </button>
                <strong>{safeQuantity}</strong>
                <button
                  onClick={() => setQuantity((value) => Math.min(Math.max(maxQuantity, 1), value + 1))}
                  type="button"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="product-detail-total is-total">
                <span>Total estimado</span>
                <strong>{formatCurrency(total, settings.currencySymbol)}</strong>
              </div>
            </div>

            <div className="product-detail-buy-note">
              <span>
                {wholesaleApplies
                  ? `Ya aplica el precio mayorista desde ${product.wholesaleMinQty} unidades.`
                  : `Compra ${product.wholesaleMinQty} o más para activar el precio mayorista.`}
              </span>
            </div>

            <div className="product-detail-buy-actions">
              <button
                className="button button-primary"
                disabled={maxQuantity <= 0}
                onClick={() => void handleAdd()}
                type="button"
              >
                <ShoppingCart size={16} />
                Añadir al carrito
              </button>
              <Link className="button button-secondary" href="/">
                Seguir comprando
              </Link>
            </div>
          </div>
        </article>
      </div>

      {fullscreenMedia && fullscreenMediaUrl ? (
        <div
          aria-modal="true"
          className="product-detail-lightbox"
          onClick={() => setFullScreenMediaId(null)}
          role="dialog"
        >
          <div className="product-detail-lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <button
              aria-label="Cerrar imagen ampliada"
              className="icon-button icon-button-close product-detail-lightbox-close"
              onClick={() => setFullScreenMediaId(null)}
              type="button"
            >
              <CircleX size={18} />
            </button>
            {fullscreenMedia.type === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={fullscreenMedia.altText ?? displayName}
                className="product-detail-lightbox-media"
                src={getOptimizedImageUrl(fullscreenMediaUrl, 1200) ?? undefined}
              />
            ) : (
              <video
                autoPlay
                className="product-detail-lightbox-media"
                controls
                playsInline
                preload="metadata"
                src={fullscreenMediaUrl}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
