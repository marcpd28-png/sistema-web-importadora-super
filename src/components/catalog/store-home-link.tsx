"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function StoreHomeLink({ children, className }: { children: ReactNode; className?: string }) {
  return <Link
    href="/#home-top"
    className={className}
    aria-label="Volver al inicio"
    onNavigate={event => {
      // A link to the current page can preserve its scroll position in Next.js.
      if (window.location.pathname === "/" && !window.location.search) {
        event.preventDefault();
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
    }}
  >{children}</Link>;
}
