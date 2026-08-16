"use client";

import { CatalogPrefetchLink } from "@/components/catalog/catalog-prefetch-link";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { getSafeMediaUrl, getOptimizedImageUrl } from "@/lib/media-url";
import type { CatalogProduct } from "@/lib/store";

type ProductMediaFrameProps = {
  product: CatalogProduct;
  displayName: string;
  href: string;
};

export function ProductMediaFrame({ product, displayName, href }: ProductMediaFrameProps) {
  const primaryMedia = product.primaryMedia;
  const primaryMediaUrl = getSafeMediaUrl(primaryMedia?.url);
  const [imageFailed, setImageFailed] = useState(false);

  const shouldShowMedia =
    primaryMedia && primaryMediaUrl && !(primaryMedia.type === "IMAGE" && imageFailed);

  return (
    <div className="product-media">
      {primaryMedia && shouldShowMedia ? (
        <CatalogPrefetchLink aria-label={`Ver detalle de ${displayName}`} className="product-media-link" href={href}>
          <div className="product-media-preview product-media-preview--detail-safe">
            {primaryMedia.type === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={primaryMedia.altText ?? displayName}
                decoding="async"
                loading="lazy"
                onError={() => setImageFailed(true)}
                referrerPolicy="no-referrer"
                src={getOptimizedImageUrl(primaryMediaUrl, 384) ?? undefined}
              />
            ) : (
              <video muted playsInline preload="metadata" src={primaryMediaUrl} />
            )}
          </div>
        </CatalogPrefetchLink>
      ) : (
        <CatalogPrefetchLink aria-label={`Ver detalle de ${displayName}`} className="product-media-link" href={href}>
          <div className="product-media-preview product-media-placeholder">
            <ImageIcon size={28} />
            <strong>{product.category ?? "Catálogo"}</strong>
            <span>{displayName}</span>
          </div>
        </CatalogPrefetchLink>
      )}
    </div>
  );
}
