"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function AdminSidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = openPath === pathname;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 920px)");
    const close = () => setOpenPath(null);
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);

  return (
    <aside
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
  );
}
