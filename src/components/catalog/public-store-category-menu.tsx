"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Menu, Battery, Car, Headphones, House, Lightbulb, NotebookPen, PackageSearch, Smartphone, X } from "lucide-react";
import type { BrandOption, CategoryOption } from "@/lib/store";
import { CatalogPrefetchLink } from "@/components/catalog/catalog-prefetch-link";

function formatCatalogLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (["de", "del", "para", "y", "e", "a", "con", "en"].includes(word) && index > 0) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function normalizeCatalogValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sortCatalogCategories(left: CategoryOption, right: CategoryOption) {
  const priority = (name: string) => {
    const normalized = normalizeCatalogValue(name);
    const priorities: Array<[RegExp, number]> = [
      [/auricular|audio/, 10],
      [/parlante/, 20],
      [/celular|telefono|movil/, 30],
      [/smart watch|smartwatch|reloj/, 40],
      [/dispositivos portatiles|tablet|celular/, 50],
      [/periferic|mouse|teclado|gamer/, 60],
      [/bateria|power bank|cargador portatil/, 70],
      [/almacenamiento|memoria|usb/, 80],
      [/entretenimiento|multimedia|consola|proyector|tv/, 90],
      [/camara de seguridad|seguridad/, 100],
      [/auto|carro|vehiculo/, 110],
      [/cocina|utencillo|domestico/, 120],
      [/hogar|iluminacion/, 130],
      [/cuidado personal/, 140],
      [/juguete.*escolar|utiles escolares|articulos escolares/, 150],
      [/equipaje|bolso/, 160],
      [/novedad/, 900],
      [/sexual/, 990],
    ];

    return priorities.find(([pattern]) => pattern.test(normalized))?.[1] ?? 500;
  };

  const priorityDelta = priority(left.name) - priority(right.name);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return formatCatalogLabel(left.name).localeCompare(formatCatalogLabel(right.name), "es");
}

function getCategoryIcon(name: string) {
  const normalized = normalizeCatalogValue(name);

  if (/celular|telefono|m[oó]vil|smart/.test(normalized)) {
    return Smartphone;
  }

  if (/auto|carro|vehiculo/.test(normalized)) {
    return Car;
  }

  if (/hogar|casa|ilumin/.test(normalized)) {
    return normalized.includes("ilumin") ? Lightbulb : House;
  }

  if (/auricular|audio/.test(normalized)) {
    return Headphones;
  }

  if (/bater/i.test(normalized)) {
    return Battery;
  }

  if (/escolar|util|cuaderno|lapic/.test(normalized)) {
    return NotebookPen;
  }

  return PackageSearch;
}

type PublicStoreCategoryMenuProps = {
  brands: BrandOption[];
  categories: CategoryOption[];
};

export function PublicStoreCategoryMenu({ brands, categories }: PublicStoreCategoryMenuProps) {
  const [panel, setPanel] = useState<"main" | "categories" | "brands" | "sites">("categories");
  const menuRef = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
    setPanel("categories");
  };

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
        setPanel("categories");
      }
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      const menu = menuRef.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
        setPanel("categories");
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, []);

  const closePanel = () => setPanel("main");

  return (
    <div className="public-store-shortcut-menu-shell">
      <details className="public-store-shortcut-menu" ref={menuRef}>
        <summary aria-label={`Abrir ${categories.length} categorías del catálogo`} className="public-store-shortcut is-lead">
          <span className="public-store-lead-icon">
            <Menu size={16} />
          </span>
          <span className="public-store-lead-label">Categorías</span>
        </summary>
        <div className="public-store-shortcut-dropdown" onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a[href]")) closeMenu();
        }}>
          <div className="public-store-category-toolbar">
            <strong>Explorar la tienda</strong>
            <button aria-label="Cerrar categorías" className="icon-button" onClick={closeMenu} type="button">
              <X size={20} />
            </button>
          </div>
        {panel === "main" ? (
          <div className="public-store-shortcut-panel">
            <button className="public-store-shortcut-row" onClick={() => setPanel("categories")} type="button">
              <span>Categorías</span>
              <ChevronDown size={18} />
            </button>
            <button className="public-store-shortcut-row" onClick={() => setPanel("brands")} type="button">
              <span>Marcas</span>
              <ChevronDown size={18} />
            </button>
            <button className="public-store-shortcut-row" onClick={() => setPanel("sites")} type="button">
              <span>Sedes</span>
              <ChevronDown size={18} />
            </button>
          </div>
        ) : null}

        {panel === "categories" ? (
          <div className="public-store-shortcut-panel">
            <button className="public-store-shortcut-back" onClick={closePanel} type="button">
              <ChevronLeft size={18} />
              <span>Menú de la tienda</span>
            </button>
            <div className="public-store-shortcut-dropdown-section">
              <div className="public-store-shortcut-dropdown-grid is-categories">
                {categories
                  .slice()
                  .sort(sortCatalogCategories)
                  .map((category) => {
                    const Icon = getCategoryIcon(category.name);

                    return (
                      <CatalogPrefetchLink
                        className="public-store-shortcut-dropdown-link is-category"
                        href={`/?category=${encodeURIComponent(category.slug)}`}
                        key={category.id}
                      >
                        <Icon size={16} />
                        <span>{formatCatalogLabel(category.name)}</span>
                      </CatalogPrefetchLink>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : null}

        {panel === "brands" ? (
          <div className="public-store-shortcut-panel">
            <button className="public-store-shortcut-back" onClick={closePanel} type="button">
              <ChevronLeft size={18} />
              <span>Marcas</span>
            </button>
            <div className="public-store-shortcut-dropdown-section">
              {brands.length ? (
                <div className="public-store-shortcut-dropdown-grid is-brands">
                  {brands.slice(0, 18).map((brand) => (
                    <CatalogPrefetchLink
                      className="public-store-shortcut-dropdown-link"
                      href={`/?brand=${encodeURIComponent(brand.name)}`}
                      key={brand.name}
                    >
                      {formatCatalogLabel(brand.name)}
                    </CatalogPrefetchLink>
                  ))}
                </div>
              ) : (
                <p className="public-store-shortcut-empty">Todavía no hay marcas configuradas.</p>
              )}
            </div>
          </div>
        ) : null}

        {panel === "sites" ? (
          <div className="public-store-shortcut-panel">
            <button className="public-store-shortcut-back" onClick={closePanel} type="button">
              <ChevronLeft size={18} />
              <span>Sedes</span>
            </button>
            <div className="public-store-shortcut-dropdown-section">
              <p className="public-store-shortcut-empty">
                No hay sedes configuradas en este momento.
              </p>
            </div>
          </div>
        ) : null}
        </div>
      </details>
    </div>
  );
}
