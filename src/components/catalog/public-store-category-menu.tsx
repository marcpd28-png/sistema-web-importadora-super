"use client";
import { useEffect, useRef, useState } from "react";
import { Menu, X, Search, ChevronDown, Headphones, Smartphone, PlugZap, Watch, Laptop, Gamepad2, Drone, CookingPot, ShieldCheck, Car, Sparkles, ToyBrick, Backpack, Heart, PackageSearch, Tags } from "lucide-react";
import type { BrandOption, CategoryOption } from "@/lib/store";
import { CatalogPrefetchLink } from "@/components/catalog/catalog-prefetch-link";
const icons = [Headphones, Smartphone, PlugZap, Watch, Laptop, Gamepad2, Drone, CookingPot, ShieldCheck, Car, Sparkles, ToyBrick, Backpack, Heart];
const slugs = ["audio", "moviles", "carga", "relojes", "computacion", "tv-videojuegos", "foto-video", "hogar", "seguridad", "auto", "cuidado", "juguetes-escolares", "bolsos", "intimo"];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function PublicStoreCategoryMenu({ brands, categories }: { brands: BrandOption[]; categories: CategoryOption[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const search = normalize(query.trim());
  const groups = [...new Set(categories.map(c => c.parentName ?? "Categorías"))];
  const visibleGroups = groups.map(group => ({ group, children: categories.filter(c => (c.parentName ?? "Categorías") === group && (!search || normalize(group).includes(search) || normalize(c.name).includes(search))) })).filter(g => g.children.length);
  const visibleBrands = brands.filter(b => !search || normalize(b.name).includes(search));
  const close = () => { if (menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <div className="public-store-shortcut-menu-shell"><details className="public-store-shortcut-menu" ref={menu} onToggle={event => { if (event.target === event.currentTarget && !event.currentTarget.open) { setQuery(""); setExpanded(null); } }}>
    <summary aria-label="Explorar categorías" className="public-store-shortcut is-lead"><span className="public-store-lead-icon"><Menu size={16} /></span><span className="public-store-lead-label">Categorías</span></summary>
    <div className="public-store-shortcut-dropdown category-menu-compact" onClick={event => { if (event.target instanceof Element && event.target.closest("a[href]")) close(); }}>
      <div className="category-menu-heading">
        <div className="public-store-category-toolbar"><strong>Categorías</strong><button type="button" className="icon-button" aria-label="Cerrar categorías" onClick={close}><X size={20} /></button></div>
        <label className="category-menu-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Buscar categorías o marcas" placeholder="Buscar categorías o marcas" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <div className="category-menu-results">
      <CatalogPrefetchLink href="/?view=all" className="public-store-shortcut-dropdown-link">Todos los productos</CatalogPrefetchLink>
      {visibleGroups.map(({ group, children }) => {
        const Icon = icons[slugs.indexOf(children[0].parentSlug?.replace("familia-", "") ?? "")] ?? PackageSearch;
        const open = search ? true : expanded === group;
        return <details className="storefront-category-group" key={group} open={open}><summary onClick={event => { event.preventDefault(); setExpanded(expanded === group ? null : group); }}><Icon size={19} aria-hidden="true" /><span>{group}</span><ChevronDown className="category-menu-chevron" size={16} aria-hidden="true" /></summary>
          {children[0].parentSlug ? <CatalogPrefetchLink href={'/?category=' + children[0].parentSlug}>Ver todo en {group}</CatalogPrefetchLink> : null}
          {children.map(c => <CatalogPrefetchLink href={'/?category=' + c.slug} key={c.slug}>{c.name}<small>{c.productCount}</small></CatalogPrefetchLink>)}
        </details>;
      })}
      {visibleBrands.length > 0 ? <details className="storefront-category-group" open={search ? true : expanded === "__brands"}><summary onClick={event => { event.preventDefault(); setExpanded(expanded === "__brands" ? null : "__brands"); }}><Tags size={19} aria-hidden="true" /><span>Marcas</span><ChevronDown className="category-menu-chevron" size={16} aria-hidden="true" /></summary>{visibleBrands.map(b => <CatalogPrefetchLink key={b.name} href={'/?brand=' + encodeURIComponent(b.name)}>{b.name}</CatalogPrefetchLink>)}</details> : null}
      {visibleGroups.length === 0 && visibleBrands.length === 0 ? <p className="category-menu-empty" role="status">No hay coincidencias. Prueba otro nombre.</p> : null}
      </div>
    </div>
  </details></div>;
}
