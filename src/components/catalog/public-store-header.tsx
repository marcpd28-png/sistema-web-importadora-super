import {
  Bot,
  Flame,
  Gamepad2,
  Menu,
  MonitorPlay,
  PackageSearch,
  Plane,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getBrandOptions } from "@/lib/store";
import type { BrandOption, CategoryOption } from "@/lib/store";
import { CatalogPrefetchLink } from "@/components/catalog/catalog-prefetch-link";
import { HeaderSearch } from "@/components/catalog/header-search";
import { getStorefrontCategories } from "@/lib/storefront-index";
import { getStorefrontCampaigns } from "@/lib/storefront-campaigns";
import { PublicStoreHeaderShell } from "@/components/catalog/public-store-header-shell";
import { PublicStoreAccountSlot } from "@/components/catalog/public-store-account-slot";
import { PublicStoreCategoryMenu } from "@/components/catalog/public-store-category-menu";

type Shortcut = {
  label: string;
  href: string;
  icon?: LucideIcon;
  lead?: boolean;
};

const SHORTCUTS: Shortcut[] = [
  { label: "Todas las categorías", href: "/", lead: true, icon: Menu },
  { label: "Productos más vendidos", href: "/?collection=mas-vendidos", icon: PackageSearch },
  { label: "Ofertas", href: "/?collection=ofertas", icon: Flame },
  { label: "Preventa", href: "/?collection=preventa", icon: Sparkles },
  { label: "Proyectores", href: "/?collection=proyectores", icon: MonitorPlay },
  { label: "Drones", href: "/?collection=drones", icon: Plane },
  { label: "Amazon Echo y Alexa", href: "/?collection=alexas", icon: Bot },
  { label: "Consolas de videojuegos", href: "/?collection=consolas", icon: Gamepad2 },
];

function CategoryShortcutMarquee({ active }: { active: string[] }) {
  const items = SHORTCUTS.slice(1).filter(item => !["/?collection=ofertas", "/?collection=preventa"].includes(item.href) || active.includes(item.href.split("=")[1]));

  return (
    <nav className="storefront-shortcuts-static" aria-label="Accesos del catálogo">
      <div aria-label="Atajos de catálogo">
        <div className="public-store-shortcuts-marquee-group">
          {items.map((shortcut) => (
            <CatalogPrefetchLink className="public-store-shortcut" href={shortcut.href} key={shortcut.label}>
              {shortcut.icon ? <shortcut.icon size={14} /> : null}
              {shortcut.label}
            </CatalogPrefetchLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

type PublicStoreHeaderProps = {
  brands?: BrandOption[];
  categories?: CategoryOption[];
  focusSearch?: boolean;
};

export async function PublicStoreHeader({
  brands,
  categories,
  focusSearch = false,
}: PublicStoreHeaderProps) {
  const session = await getSession();
  const [resolvedCategories, resolvedBrands, campaigns] = await Promise.all([
    categories ? Promise.resolve(categories) : getStorefrontCategories(),
    brands ? Promise.resolve(brands) : getBrandOptions(),
    getStorefrontCampaigns(),
  ]);

  return (
    <PublicStoreHeaderShell>
      <header className="public-store-header">
        <div className="public-store-bar">
          <div className="public-store-desktop-category-slot">
            <PublicStoreCategoryMenu brands={resolvedBrands} categories={resolvedCategories} />
          </div>
          <div className="public-store-mobile-category-slot">
            <PublicStoreCategoryMenu brands={resolvedBrands} categories={resolvedCategories} />
          </div>
          <HeaderSearch autoFocus={focusSearch} />

          <div className="public-store-actions">
            <div className="public-store-account-slot">
              <PublicStoreAccountSlot role={session?.role} />
            </div>
          </div>
        </div>

        <div className="public-store-desktop-shortcuts">
        <div className="public-store-topline">
            <CategoryShortcutMarquee active={campaigns.filter(c => c.visible).map(c => c.slug)} />
          </div>
        </div>
        <div className="public-store-mobile-marquee">
          <CategoryShortcutMarquee active={campaigns.filter(c => c.visible).map(c => c.slug)} />
        </div>
      </header>
    </PublicStoreHeaderShell>
  );
}
