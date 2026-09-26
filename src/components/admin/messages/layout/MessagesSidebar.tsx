"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, Zap, FileCode2, Users, Activity, Settings, Bug, MessageCircleMore } from "lucide-react";

export function MessagesSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { name: "Bandeja", href: "/admin/mensajes", icon: Inbox, exact: true },
    { name: "Automatizaciones", href: "/admin/mensajes/automatizaciones", icon: Zap, exact: false },
    { name: "Plantillas", href: "/admin/mensajes/plantillas", icon: FileCode2, exact: false },
    { name: "Contactos", href: "/admin/mensajes/contactos", icon: Users, exact: false },
    { name: "Actividad", href: "/admin/mensajes/actividad", icon: Activity, exact: false },
    { name: "Simulador", href: "/admin/mensajes/simulador", icon: Bug, exact: false },
    { name: "Configuración", href: "/admin/mensajes/configuracion", icon: Settings, exact: false },
  ];

  return (
    <header className="messages-app-navigation">
      <select className="messages-mobile-section" aria-label="Sección del centro de mensajes" value={navItems.find((item) => item.exact ? pathname === item.href : pathname.startsWith(item.href))?.href ?? "/admin/mensajes"} onChange={(event) => router.push(event.target.value)}>
        {navItems.map((item) => <option key={item.href} value={item.href}>{item.name}</option>)}
      </select>
      <div className="messages-app-navigation-title">
        <span className="messages-app-navigation-icon" aria-hidden="true">
          <MessageCircleMore size={20} />
        </span>
        <div>
          <p>Atención al cliente</p>
          <h2>Centro de Mensajes</h2>
        </div>
      </div>
      <nav aria-label="Secciones del Centro de Mensajes" className="messages-app-sidebar-nav">
        {navItems.map((item) => {
          const isActive = item.exact 
            ? pathname === item.href 
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`messages-app-sidebar-link ${isActive ? "is-active" : ""}`}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
