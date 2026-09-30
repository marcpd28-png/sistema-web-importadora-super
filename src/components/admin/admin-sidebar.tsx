"use client";

import { Menu, X, House, PackageSearch, ShoppingBag, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function AdminSidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const open = openPath === pathname;
  const destinations = [
    { href: "/admin", label: "Inicio", icon: House },
    { href: "/admin/products", label: "Productos", icon: PackageSearch },
    { href: "/admin/orders", label: "Pedidos", icon: ShoppingBag },
    { href: "/admin/mensajes", label: "Mensajes", icon: MessageCircle },
  ];

  useEffect(() => {
    const media = window.matchMedia("(max-width: 920px)");
    const close = () => setOpenPath(null);
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) setOpenPath(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <>
    <aside
      ref={sidebarRef}
      className="admin-sidebar"
      data-mobile-open={open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpenPath(null);
          buttonRef.current?.focus();
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenPath(null);
      }}
    >
      <div className="admin-mobile-header">
        <span>Administración</span>
        <button
          ref={buttonRef}
          type="button"
          className="admin-mobile-menu-button"
          aria-expanded={open}
          aria-controls="admin-sidebar-navigation"
          onClick={() => setOpenPath(open ? null : pathname)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      <div
        className="admin-sidebar-main"
        id="admin-sidebar-navigation"
        onClick={(event) => {
          if (open && (event.target as HTMLElement).closest("a[href]")) {
            setOpenPath(null);
            buttonRef.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </aside>
    <nav className="admin-mobile-dock" aria-label="Accesos frecuentes">
      {destinations.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setOpenPath(null)}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>;
      })}
    </nav>
    </>
  );
}
