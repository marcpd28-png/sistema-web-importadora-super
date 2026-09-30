"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { BrandOption, CategoryOption } from "@/lib/store-types";

type Props = { categories: CategoryOption[]; brands: BrandOption[]; category: string; collection: string;
  query: string; brand: string; sort: string; minPrice?: number; maxPrice?: number; inStock: boolean; count: number; productCount: number; featuredOnly: boolean };
export function CatalogFilters(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const filtersId = useId();
  const activeFilterCount = [
    props.category && props.category !== "all",
    props.brand && props.brand !== "all",
    props.minPrice !== undefined,
    props.maxPrice !== undefined,
    props.inStock,
    props.featuredOnly,
  ].filter(Boolean).length;
  return <section className="storefront-filter-panel" aria-label="Filtros de productos">
    <div className="storefront-filter-header">
      <p role="status" title="Productos publicados por código; los modelos agrupan variantes de color. No son unidades de stock.">{props.productCount} {props.productCount === 1 ? "producto" : "productos"} · {props.count} {props.count === 1 ? "modelo" : "modelos"}</p>
      <button type="button" className="storefront-filter-toggle" aria-expanded={expanded} aria-controls={filtersId} onClick={() => setExpanded(value => !value)}>
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>{expanded ? "Ocultar" : "Filtros"}</span>
        {activeFilterCount > 0 ? <span className="storefront-filter-count" aria-label={`${activeFilterCount} filtros activos`}>{activeFilterCount}</span> : null}
        <ChevronDown size={16} aria-hidden="true" className="storefront-filter-chevron" />
      </button>
    </div>
    <div id={filtersId} className={`storefront-filter-content${expanded ? " is-expanded" : ""}`}>
    <p className="category-menu-count-note">Los productos se cuentan por código publicado. Los modelos agrupan variantes de color. Estos conteos no son unidades de stock.</p>
    <form action="/" className="storefront-filters">
      {props.collection ? <input type="hidden" name="collection" value={props.collection} /> : null}
      {props.query ? <input type="hidden" name="q" value={props.query} /> : null}
      {props.featuredOnly ? <input type="hidden" name="featured" value="1" /> : null}
      <label>Categoría<select name="category" defaultValue={props.category}><option value="all">Todas</option>
        {props.categories.map(c => <option key={c.slug} value={c.slug}>{c.parentName ? `${c.parentName} · ` : ""}{c.name}</option>)}
      </select></label>
      <label>Marca<select name="brand" defaultValue={props.brand}><option value="all">Todas</option>
        {props.brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
      </select></label>
      <label>Desde S/<input name="minPrice" type="number" min="0" step="0.01" defaultValue={props.minPrice} inputMode="decimal" /></label>
      <label>Hasta S/<input name="maxPrice" type="number" min="0" step="0.01" defaultValue={props.maxPrice} inputMode="decimal" /></label>
      <label>Ordenar<select name="sort" defaultValue={props.collection === "mas-vendidos" ? "featured" : props.sort} disabled={props.collection === "mas-vendidos"}>
        <option value="featured">{props.collection === "mas-vendidos" ? "Ventas del ERP" : "Recomendados"}</option><option value="price-asc">Menor precio</option><option value="price-desc">Mayor precio</option><option value="newest">Actualizados recientemente</option>
      </select></label>
      <label className="storefront-stock-filter"><input name="inStock" type="checkbox" value="1" defaultChecked={props.inStock} /> Con stock</label>
      <button className="button button-primary" type="submit">Aplicar</button>
      <Link className="button button-secondary" href={props.collection ? `/?collection=${encodeURIComponent(props.collection)}` : "/?view=all"}>Limpiar</Link>
      <input type="hidden" name="view" value="all" />
    </form>
    {props.collection === "mas-vendidos" ? <p className="muted">El orden de esta selección corresponde a las unidades vendidas en el ERP.</p> : null}
    </div>
  </section>;
}
