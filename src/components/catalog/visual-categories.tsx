import Link from "next/link";
import type { CSSProperties } from "react";
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

export function VisualCategories({ families }: { families: CategoryOption[] }) {
  return <section className="storefront-visual-categories" aria-labelledby="visual-categories-title">
    <div className="catalog-section-header"><h2 id="visual-categories-title">¿Qué estás buscando?</h2><Link href="/?view=all">Ver todos los productos</Link></div>
    <div className="storefront-category-tiles" style={{ "--category-count": Math.max(1, families.length) } as CSSProperties}>{families.map(family => {
      const Icon = familyIcons[family.slug] ?? PackageSearch;
      return <Link href={`/?category=${family.slug}`} key={family.slug} className="storefront-category-tile">
        <span className="storefront-category-icon"><Icon aria-hidden="true" size={32} strokeWidth={1.7} /></span>
        <span>{family.name}</span>
      </Link>;
    })}
    </div>
  </section>;
}
