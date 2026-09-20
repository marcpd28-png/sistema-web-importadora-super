"use client";

import Link from "next/link";
import { useState, useRef, type CSSProperties } from "react";
import {
  Backpack, Car, CookingPot, Drone, Gamepad2, Headphones, Heart,
  Laptop, PackageSearch, PlugZap, ShieldCheck, Smartphone, Sparkles,
  ToyBrick, Watch, type LucideIcon,
} from "lucide-react";
import type { CategoryOption } from "@/lib/store-types";

const familyIcons: Record<string, LucideIcon> = {
  "familia-audio": Headphones,
  "familia-moviles": Smartphone,
  "familia-carga": PlugZap,
  "familia-relojes": Watch,
  "familia-computacion": Laptop,
  "familia-tv-videojuegos": Gamepad2,
  "familia-foto-video": Drone,
  "familia-hogar": CookingPot,
  "familia-seguridad": ShieldCheck,
  "familia-auto": Car,
  "familia-cuidado": Sparkles,
  "familia-juguetes-escolares": ToyBrick,
  "familia-bolsos": Backpack,
  "familia-intimo": Heart,
};

const mobileNames: Record<string, string> = {
  "familia-audio": "Audio", "familia-moviles": "Celulares",
  "familia-carga": "Cargadores", "familia-relojes": "Relojes",
  "familia-computacion": "Cómputo", "familia-tv-videojuegos": "TV y juegos",
  "familia-foto-video": "Drones", "familia-hogar": "Hogar",
  "familia-seguridad": "Seguridad", "familia-auto": "Autos",
  "familia-cuidado": "Cuidado", "familia-juguetes-escolares": "Juguetes",
  "familia-bolsos": "Bolsos", "familia-intimo": "Bienestar",
};

export function VisualCategories({ families }: { families: CategoryOption[] }) {
  const [expanded, setExpanded] = useState(false);
  const tilesRef = useRef<HTMLDivElement>(null);
  return <section className={`storefront-visual-categories${expanded ? " categories-expanded" : ""}`} aria-labelledby="visual-categories-title">
    <div className="catalog-section-header"><h2 id="visual-categories-title"><span className="category-desktop-label">¿Qué estás buscando?</span><span className="category-mobile-label">Categorías</span></h2><Link className="category-desktop-label" href="/?view=all">Ver todos los productos</Link><button className="category-expand-button" type="button" aria-expanded={expanded} aria-controls="storefront-category-tiles" onClick={() => { setExpanded(!expanded); if (tilesRef.current) tilesRef.current.scrollLeft = 0; }}>{expanded ? "Ver menos" : `Todas (${families.length})`}</button></div>
    <div id="storefront-category-tiles" ref={tilesRef} className="storefront-category-tiles" style={{ "--category-count": Math.max(1, families.length) } as CSSProperties}>{families.map(family => {
      const Icon = familyIcons[family.slug] ?? PackageSearch;
      return <Link href={`/?category=${family.slug}`} key={family.slug} className="storefront-category-tile" title={family.name} aria-label={family.name}>
        <span className="storefront-category-icon"><Icon aria-hidden="true" size={32} strokeWidth={1.7} /></span>
        <span className="category-full-name">{family.name}</span>
        <span className="category-short-name" aria-hidden="true">{mobileNames[family.slug] ?? family.name}</span>
      </Link>;
    })}
    </div>
  </section>;
}
