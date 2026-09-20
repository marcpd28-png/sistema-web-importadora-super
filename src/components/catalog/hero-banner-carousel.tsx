"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HeroBannerVisual, type HeroBannerVisualData } from "@/components/catalog/hero-banner-visual";

type HeroBannerCarouselProps = {
  banners: HeroBannerVisualData[];
  intervalSeconds: number;
};

export function HeroBannerCarousel({ banners, intervalSeconds }: HeroBannerCarouselProps) {
  const slides = useMemo(() => banners.filter(Boolean).slice(0, 1), [banners]);
  const [activeIndex, setActiveIndex] = useState(0);
  const currentIndex = slides.length ? Math.min(activeIndex, slides.length - 1) : 0;
  const slideCount = slides.length;

  useEffect(() => {
    if (slideCount <= 1 || intervalSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slideCount);
    }, intervalSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [intervalSeconds, slideCount]);

  function goToPrevious() {
    setActiveIndex((current) => (current - 1 + slideCount) % slideCount);
  }

  function goToNext() {
    setActiveIndex((current) => (current + 1) % slideCount);
  }

  if (!slides.length) {
    return null;
  }

  return (
    <div className="hero-banner-carousel" aria-roledescription="carousel">
      <div
        className="hero-banner-carousel-track"
        style={{
          transform: `translate3d(-${activeIndex * 100}%, 0, 0)`,
        }}
      >
        {slides.map((slide, index) => (
          <article
            aria-hidden={index !== currentIndex}
            className={`hero-banner-carousel-slide ${index === currentIndex ? "is-active" : ""}`}
            data-active={index === currentIndex ? "true" : "false"}
            key={slide.id ?? `${slide.desktopImageUrl}-${slide.title ?? index}`}
          >
            <HeroBannerVisual banner={slide} eager={index === 0} mode="auto" />
          </article>
        ))}
      </div>

      {slides.length > 1 ? (
        <>
          <button
            aria-label="Banner anterior"
            className="hero-carousel-nav hero-carousel-nav-prev"
            onClick={goToPrevious}
            type="button"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            aria-label="Siguiente banner"
            className="hero-carousel-nav hero-carousel-nav-next"
            onClick={goToNext}
            type="button"
          >
            <ChevronRight size={20} />
          </button>

          <div className="hero-carousel-dots">
            {slides.map((slide, index) => (
              <button
                aria-label={`Ir al banner ${index + 1}`}
                className={index === currentIndex ? "is-active" : ""}
                key={slide.id ?? `${slide.desktopImageUrl}-dot-${index}`}
                onClick={() => setActiveIndex(index)}
                type="button"
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
