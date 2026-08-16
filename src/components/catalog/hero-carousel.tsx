"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/media-url";
import type { HeroSlideView } from "@/lib/store";
import { useHorizontalCarousel } from "@/components/catalog/use-horizontal-carousel";

type HeroCarouselProps = {
  slides: HeroSlideView[];
  intervalSeconds: number;
};

export function HeroCarousel({ slides, intervalSeconds }: HeroCarouselProps) {
  const { activeIndex, goToNext, goToPrevious, handleScroll, scrollToIndex, viewportRef } =
    useHorizontalCarousel({ itemCount: slides.length, intervalSeconds });

  return (
    <div className="hero-carousel" onScroll={handleScroll} ref={viewportRef}>
      {slides.map((slide, index) => (
        <article
          className={`hero-carousel-slide ${index === activeIndex ? "is-active" : ""}`}
          key={`${slide.imageUrl}-${index}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={slide.title ?? `Slide ${index + 1}`}
            decoding="async"
            loading={index === 0 ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
            src={getOptimizedImageUrl(slide.imageUrl, 1200) ?? slide.imageUrl}
          />
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
            {slides.map((slide, index) => (
              <button
                aria-label={`Ir al slide ${index + 1}`}
                className={index === activeIndex ? "is-active" : ""}
                key={`${slide.imageUrl}-dot-${index}`}
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
