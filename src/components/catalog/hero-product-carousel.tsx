"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getSafeMediaUrl, getOptimizedImageUrl } from "@/lib/media-url";
import { getPublicProductName } from "@/lib/product-name";
import type { CatalogProduct } from "@/lib/store";
import { useHorizontalCarousel } from "@/components/catalog/use-horizontal-carousel";

type HeroProductCarouselProps = {
  products: CatalogProduct[];
  intervalSeconds: number;
};

function chunkProducts(products: CatalogProduct[], size: number) {
  const chunks: CatalogProduct[][] = [];

  for (let index = 0; index < products.length; index += size) {
    chunks.push(products.slice(index, index + size));
  }

  return chunks;
}

export function HeroProductCarousel({ products, intervalSeconds }: HeroProductCarouselProps) {
  const slides = useMemo(() => chunkProducts(products, 2).filter((group) => group.length), [products]);
  const { activeIndex, goToNext, goToPrevious, handleScroll, scrollToIndex, viewportRef } =
    useHorizontalCarousel({ itemCount: slides.length, intervalSeconds });

  if (!slides.length) {
    return null;
  }

  return (
    <div className="hero-product-carousel" onScroll={handleScroll} ref={viewportRef}>
      {slides.map((slide, index) => (
        <article
          className={`hero-product-carousel-slide ${index === activeIndex ? "is-active" : ""}`}
          key={`hero-product-slide-${index}`}
        >
          {slide.map((product) => {
            const mediaUrl = getSafeMediaUrl(product.primaryMedia?.url ?? product.imageUrl);

            if (!mediaUrl) {
              return null;
            }

            return (
              <Link
                aria-label={getPublicProductName(product.name)}
                className="hero-product-carousel-item"
                href={`/producto/${product.slug}`}
                key={product.id}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={getPublicProductName(product.name)}
                  decoding="async"
                  loading={index === 0 ? "eager" : "lazy"}
                  referrerPolicy="no-referrer"
                  src={getOptimizedImageUrl(mediaUrl, 640) ?? mediaUrl}
                />
              </Link>
            );
          })}
        </article>
      ))}

      {slides.length > 1 ? (
        <>
          <button
            aria-label="Slide anterior"
            className="hero-carousel-nav hero-carousel-nav-prev"
            onClick={goToPrevious}
            type="button"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            aria-label="Siguiente slide"
            className="hero-carousel-nav hero-carousel-nav-next"
            onClick={goToNext}
            type="button"
          >
            <ChevronRight size={20} />
          </button>

          <div className="hero-carousel-dots">
            {slides.map((_, index) => (
              <button
                aria-label={`Ir al slide ${index + 1}`}
                className={index === activeIndex ? "is-active" : ""}
                key={`hero-product-dot-${index}`}
                onClick={() => scrollToIndex(index)}
                type="button"
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
