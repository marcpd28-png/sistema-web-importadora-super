"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ChartNoAxesCombined,
  DatabaseZap,
  FileText,
  FolderTree,
  ImagePlus,
  LogOut,
  MessageCircle,
  MessageSquareHeart,
  PackagePlus,
  PackageSearch,
  QrCode,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Store,
  Tag,
  UsersRound,
  ChevronDown,
  ChevronRight
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
      { href: "/qr", label: "QR tienda", icon: QrCode },
    ],
  },
  {
    title: "Gestión Comercial",
    links: [
      { href: "/admin/products", label: "Productos", icon: PackageSearch, badgeKey: "lowStockProductsCount" },
      { href: "/admin/fichas", label: "Fichas digitales / QR", icon: QrCode },
      { href: "/admin/categories", label: "Categorías", icon: FolderTree },
      { href: "/admin/products/new", label: "Nuevo producto", icon: PackagePlus },
      { href: "/admin/orders", label: "Órdenes / Pagos", icon: ShoppingBag, badgeKey: "pendingOrdersCount" },
      { href: "/admin/quotes", label: "Cotizaciones", icon: FileText, badgeKey: "pendingQuotesCount" },
      { href: "/admin/cupones", label: "Cupones de Descuento", icon: Tag },
      { href: "/admin/banners", label: "Banners y campañas", icon: ImagePlus },
    ],
  },
  {
    title: "Clientes y Atención",
    links: [
      { href: "/admin/users", label: "Usuarios", icon: UsersRound },
      { href: "/admin/mensajes", label: "Centro Mensajes", icon: MessageCircle },
      { href: "/admin/opiniones", label: "Opiniones", icon: MessageSquareHeart },
      { href: "/admin/reclamos", label: "Libro Reclam.", icon: ShieldAlert, badgeKey: "newComplaintsCount" },
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

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    "Principal": true,
    "Gestión Comercial": true,
    "Clientes y Atención": true,
    "Integraciones y Sistema": true
  });
  
  useEffect(() => {
    const saved = localStorage.getItem("admin-nav-expanded");
    if (saved) {
      try {
        setExpandedSections(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const toggleSection = (title: string) => {
    const newState = { ...expandedSections, [title]: !expandedSections[title] };
    setExpandedSections(newState);
    localStorage.setItem("admin-nav-expanded", JSON.stringify(newState));
  };

  const handlePrefetch = (href?: string) => {
    if (href) {
      router.prefetch(href);
    }
  };

  return (
    <nav className="admin-nav" aria-label="Navegación administrativa">
      {sections.map((section) => {
        const isExpanded = expandedSections[section.title] !== false;
        
        return (
          <section className="admin-nav-section" key={section.title}>
            <button 
              type="button"
              className="admin-nav-section-title"
              onClick={() => toggleSection(section.title)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between", padding: "0.25rem 2rem 0.25rem 0.5rem",
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                
                color: "var(--muted)",
                fontFamily: "inherit",
                textTransform: "uppercase",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                marginBottom: "0.5rem",
                textAlign: "left"
              }}
              title={isExpanded ? "Colapsar sección" : "Expandir sección"}
            >
              <span>{section.title}</span>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className={cn("admin-nav-links", !isExpanded && "is-accordion-closed")}>
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
        );
      })}
    </nav>
  );
}
