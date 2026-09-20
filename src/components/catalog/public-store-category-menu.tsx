"use client";
import { useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import type { BrandOption, CategoryOption } from "@/lib/store";
import { CatalogPrefetchLink } from "@/components/catalog/catalog-prefetch-link";
export function PublicStoreCategoryMenu({ brands, categories }: { brands: BrandOption[]; categories: CategoryOption[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const groups = [...new Set(categories.map(c => c.parentName ?? "Categorías"))];
  const close = () => { if (menu.current) menu.current.open = false; };
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <div className="public-store-shortcut-menu-shell"><details className="public-store-shortcut-menu" ref={menu}>
    <summary aria-label="Explorar categorías" className="public-store-shortcut is-lead"><span className="public-store-lead-icon"><Menu size={16} /></span><span className="public-store-lead-label">Categorías</span></summary>
    <div className="public-store-shortcut-dropdown" onClick={event => { if (event.target instanceof Element && event.target.closest("a[href]")) close(); }}>
      <div className="public-store-category-toolbar"><strong>Explorar la tienda</strong><button type="button" className="icon-button" aria-label="Cerrar categorías" onClick={close}><X size={20} /></button></div>
      <CatalogPrefetchLink href="/?view=all" className="public-store-shortcut-dropdown-link">Todos los productos</CatalogPrefetchLink>
      {groups.map(group => {
        const children = categories.filter(c => (c.parentName ?? "Categorías") === group);
        return <details className="storefront-category-group" key={group}><summary>{group}</summary>
          {children[0].parentSlug ? <CatalogPrefetchLink href={'/?category=' + children[0].parentSlug}>Ver todo en {group}</CatalogPrefetchLink> : null}
          {children.map(c => <CatalogPrefetchLink href={'/?category=' + c.slug} key={c.slug}>{c.name}<small>{c.productCount}</small></CatalogPrefetchLink>)}
        </details>;
      })}
      <details className="storefront-category-group"><summary>Marcas</summary>{brands.map(b => <CatalogPrefetchLink key={b.name} href={'/?brand=' + encodeURIComponent(b.name)}>{b.name}</CatalogPrefetchLink>)}</details>
    </div>
  </details></div>;
}
