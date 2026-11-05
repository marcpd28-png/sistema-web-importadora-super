"use client";

import Link from "next/link";
import { BookOpenText, FileText, MessageCircleMore, MessagesSquare, Music2, Send } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./advisor-nav.module.css";

const links = [
  { href: "/asesor/catalogo", label: "Catálogo", icon: BookOpenText },
  { href: "/asesor/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/asesor/mensajes/whatsapp", label: "Mensajes WhatsApp", icon: MessagesSquare },
  { href: "/asesor/mensajes", label: "Centro de mensajes", icon: MessagesSquare },
];

const messageChannels = [
  { href: "/asesor/mensajes", label: "Telegram", icon: Send },
  { href: "/asesor/mensajes/messenger", label: "Messenger", icon: MessageCircleMore },
  { href: "/asesor/mensajes/tiktok", label: "TikTok", icon: Music2 },
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
      <section aria-label="Canales de atención" className={styles.channelGroup}>
        <p className={styles.channelLabel}>Canales de atención</p>
        <div className={styles.channelLinks}>
          {messageChannels.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/asesor/mensajes" && pathname.startsWith(`${href}/`));

            return (
              <Link aria-current={active ? "page" : undefined} className={styles.channelLink} data-active={active} href={href} key={href}>
                <Icon aria-hidden="true" size={15} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </section>
      <p className={styles.hint}>Acceso comercial limitado a consulta de catálogo, atención de cotizaciones y conversaciones con clientes.</p>
    </nav>
  );
}
