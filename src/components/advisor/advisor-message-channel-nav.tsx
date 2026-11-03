"use client";

import Link from "next/link";
import { MessageCircleMore, Music2, Send } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./advisor-message-channel-nav.module.css";

const channels = [
  { href: "/asesor/mensajes", label: "Telegram", icon: Send },
  { href: "/asesor/mensajes/messenger", label: "Messenger", icon: MessageCircleMore },
  { href: "/asesor/mensajes/tiktok", label: "TikTok", icon: Music2 },
] as const;

export function AdvisorMessageChannelNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Canales de atención" className={styles.navigation}>
      <span className={styles.label}>Canales</span>
      <div className={styles.links}>
        {channels.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/asesor/mensajes" && pathname.startsWith(`${href}/`));

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={styles.link}
              data-active={active}
              href={href}
              key={href}
            >
              <Icon aria-hidden="true" size={15} strokeWidth={2.2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
