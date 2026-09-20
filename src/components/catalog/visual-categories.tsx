import Link from "next/link";
import { PackageSearch } from "lucide-react";
import type { CategoryOption } from "@/lib/store-types";

export function VisualCategories({ families }: { families: CategoryOption[] }) {
  return <section className="storefront-visual-categories" aria-labelledby="visual-categories-title">
    <div className="catalog-section-header"><h2 id="visual-categories-title">¿Qué estás buscando?</h2><Link href="/?view=all">Ver todos los productos</Link></div>
    <div className="storefront-category-tiles">{families.filter(f => f.slug !== "familia-intimo").map(family =>
      <Link href={`/?category=${family.slug}`} key={family.slug} className="storefront-category-tile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {family.imageUrl ? <img src={family.imageUrl} alt="" loading="lazy" width={72} height={72} /> : <PackageSearch aria-hidden size={36} />}
        <span>{family.name}</span>
      </Link>)}
    </div>
  </section>;
}
