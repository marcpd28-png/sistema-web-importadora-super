"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartNoAxesCombined,
  DatabaseZap,
  FileText,
  FolderTree,
  ImagePlus,
  LogOut,
  MessageSquareHeart,
  PackagePlus,
  PackageSearch,
  Settings,
  ShieldAlert,
  Store,
  UsersRound,
} from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import type { AdminNavBadges } from "@/lib/admin";
import { cn } from "@/lib/utils";

type AdminNavLink = {
  href?: string;
  label: string;
  icon: typeof ChartNoAxesCombined;
  kind?: "link" | "action";
  badgeKey?: keyof AdminNavBadges;
};

type AdminNavSection = {
  title: string;
  links: AdminNavLink[];
};

const sections: AdminNavSection[] = [
  {
    title: "Principal",
    links: [
      { href: "/admin", label: "Dashboard", icon: ChartNoAxesCombined },
      { href: "/", label: "Ver catálogo", icon: Store },
    ],
  },
  {
    title: "Gestión Comercial",
    links: [
      { href: "/admin/products", label: "Productos", icon: PackageSearch, badgeKey: "lowStockProductsCount" },
      { href: "/admin/categories", label: "Categorías", icon: FolderTree },
      { href: "/admin/products/new", label: "Nuevo producto", icon: PackagePlus },
      { href: "/admin/quotes", label: "Cotizaciones", icon: FileText, badgeKey: "pendingQuotesCount" },
      { href: "/admin/banners", label: "Banners y campañas", icon: ImagePlus },
    ],
  },
  {
    title: "Clientes y Atención",
    links: [
      { href: "/admin/users", label: "Usuarios", icon: UsersRound },
      { href: "/admin/opiniones", label: "Opiniones", icon: MessageSquareHeart },
      { href: "/admin/reclamos", label: "Reclamos", icon: ShieldAlert, badgeKey: "newComplaintsCount" },
    ],
  },
  {
    title: "Integraciones y Sistema",
    links: [
      { href: "/admin/erp", label: "Sincronización ERP", icon: DatabaseZap },
      { href: "/admin/settings", label: "Configuración general", icon: Settings },
      { label: "Cerrar sesión", icon: LogOut, kind: "action" },
    ],
  },
];

type AdminNavProps = {
  badges?: AdminNavBadges;
};

export function AdminNav({ badges }: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handlePrefetch = (href?: string) => {
    if (href) {
      router.prefetch(href);
    }
  };

  return (
    <nav className="admin-nav" aria-label="Navegación administrativa">
      {sections.map((section) => (
        <section className="admin-nav-section" key={section.title}>
          <p className="admin-nav-section-title">{section.title}</p>
          <div className="admin-nav-links">
            {section.links.map((link) => {
              const Icon = link.icon;
              const isLink = link.kind !== "action" && Boolean(link.href);
              const isActive =
                isLink &&
                (pathname === link.href ||
                  (link.href !== "/admin" && link.href !== "/" && pathname.startsWith(`${link.href}/`)));
              const badgeCount = link.badgeKey && badges ? badges[link.badgeKey] : 0;

              if (link.kind === "action") {
                return (
                  <form action={logoutAction} key={link.label}>
                    <button className="admin-nav-link admin-nav-button" type="submit">
                      <span className="admin-nav-icon">
                        <Icon size={18} />
                      </span>
                      <span className="admin-nav-label">{link.label}</span>
                    </button>
                  </form>
                );
              }

              if (!link.href) {
                return null;
              }

              return (
                <Link
                  key={link.href}
                  className={cn(
                    "admin-nav-link",
                    isActive && "is-active",
                  )}
                  href={link.href}
                  onFocus={() => handlePrefetch(link.href)}
                  onMouseEnter={() => handlePrefetch(link.href)}
                  onTouchStart={() => handlePrefetch(link.href)}
                >
                  <span className="admin-nav-icon">
                    <Icon size={18} />
                  </span>
                  <span className="admin-nav-label">{link.label}</span>
                  {badgeCount > 0 ? (
                    <span className="admin-nav-badge">{badgeCount}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

