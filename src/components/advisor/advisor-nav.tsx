"use client";

import Link from "next/link";
import { BookOpenText, FileText, MessagesSquare } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./advisor-nav.module.css";

const links = [
  { href: "/asesor/catalogo", label: "Catálogo", icon: BookOpenText },
  { href: "/asesor/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/asesor/mensajes", label: "Centro de mensajes", icon: MessagesSquare },
];

export function AdvisorNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación de asesor" className={styles.nav}>
      <p className={styles.label}>Espacio comercial</p>
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link aria-current={active ? "page" : undefined} className={styles.link} data-active={active} href={href} key={href}>
            <span className={styles.icon}><Icon size={18} /></span>
            <span>{label}</span>
          </Link>
        );
      })}
      <p className={styles.hint}>Acceso comercial limitado a consulta de catálogo, atención de cotizaciones y conversaciones con clientes.</p>
    </nav>
  );
}
