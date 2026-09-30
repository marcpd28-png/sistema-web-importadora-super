"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type ScrollingShortcutsMarqueeProps = {
  children: ReactNode;
  speed?: number;
  repeatCount?: number;
};

function wrapOffset(value: number, cycleWidth: number) {
  if (cycleWidth <= 0) {
    return 0;
  }

  const wrapped = value % cycleWidth;

  return wrapped < 0 ? wrapped + cycleWidth : wrapped;
}

export function ScrollingShortcutsMarquee({
  children,
  speed = 0.35,
  repeatCount = 2,
}: ScrollingShortcutsMarqueeProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const firstGroupRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    draggingStarted: false,
  });
  const offsetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [cycleWidth, setCycleWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const updateCycleWidth = () => {
      const group = firstGroupRef.current;

      if (!group) {
        return;
      }

      const track = group.parentElement;
      const styles = track ? window.getComputedStyle(track) : null;
      const gap = styles ? Number.parseFloat(styles.columnGap || styles.gap || "0") || 0 : 0;

      setCycleWidth(group.getBoundingClientRect().width + gap);
    };

    updateCycleWidth();

    const group = firstGroupRef.current;

    if (!group) {
      return;
    }

    const resizeObserver = new ResizeObserver(updateCycleWidth);
    resizeObserver.observe(group);

    window.addEventListener("resize", updateCycleWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCycleWidth);
    };
  }, []);

  useEffect(() => {
    if (cycleWidth <= 0) {
      return;
    }

    const step = () => {
      const viewport = viewportRef.current;

      if (viewport && !dragStateRef.current.active) {
        offsetRef.current = wrapOffset(offsetRef.current + speed, cycleWidth);
        viewport.scrollLeft = offsetRef.current;
      }

      frameRef.current = window.requestAnimationFrame(step);
    };

    const staticView = window.matchMedia("(max-width: 920px), (prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (!staticView.matches) {
        frameRef.current = window.requestAnimationFrame(step);
      }
    };
    updateMotion();
    staticView.addEventListener("change", updateMotion);

    return () => {
      staticView.removeEventListener("change", updateMotion);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [cycleWidth, speed]);

  return (
    <div
      className={`public-store-shortcuts-marquee${isDragging ? " is-dragging" : ""}`}
      onPointerDown={(event) => {
        const viewport = event.currentTarget as HTMLDivElement;

        if (event.pointerType !== "mouse" && event.pointerType !== "pen" && event.pointerType !== "touch") {
          return;
        }

        dragStateRef.current.active = false;
        dragStateRef.current.draggingStarted = false;
        dragStateRef.current.pointerId = event.pointerId;
        dragStateRef.current.startX = event.clientX;
        dragStateRef.current.startScrollLeft = viewport.scrollLeft;
        offsetRef.current = viewport.scrollLeft;
      }}
      onPointerMove={(event) => {
        if (dragStateRef.current.pointerId !== event.pointerId || cycleWidth <= 0) {
          return;
        }

        const deltaX = event.clientX - dragStateRef.current.startX;
        const viewport = event.currentTarget as HTMLDivElement;

        if (!dragStateRef.current.draggingStarted) {
          if (Math.abs(deltaX) < 6) {
            return;
          }

          dragStateRef.current.draggingStarted = true;
          dragStateRef.current.active = true;
          setIsDragging(true);
          viewport.setPointerCapture(event.pointerId);
        }

        const nextScrollLeft = dragStateRef.current.startScrollLeft - deltaX;

        offsetRef.current = nextScrollLeft;
        viewport.scrollLeft = nextScrollLeft;
      }}
      onPointerUp={(event) => {
        const viewport = event.currentTarget;

        if (dragStateRef.current.pointerId === event.pointerId && viewport.hasPointerCapture(event.pointerId)) {
          viewport.releasePointerCapture(event.pointerId);
        }

        dragStateRef.current.active = false;
        dragStateRef.current.pointerId = -1;
        dragStateRef.current.draggingStarted = false;
        offsetRef.current = viewport.scrollLeft;
        setIsDragging(false);
      }}
      onPointerLeave={() => {
        dragStateRef.current.active = false;
        dragStateRef.current.pointerId = -1;
        dragStateRef.current.draggingStarted = false;
        setIsDragging(false);
      }}
      onPointerCancel={() => {
        dragStateRef.current.active = false;
        dragStateRef.current.pointerId = -1;
        dragStateRef.current.draggingStarted = false;
        setIsDragging(false);
      }}
      ref={viewportRef}
    >
      <div className="public-store-shortcuts-marquee-track">
        {Array.from({ length: Math.max(2, repeatCount) }, (_, index) => (
          <div
            className="public-store-shortcuts-marquee-copy"
            aria-hidden={index > 0}
            key={`shortcut-copy-${index}`}
            ref={index === 0 ? firstGroupRef : undefined}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
