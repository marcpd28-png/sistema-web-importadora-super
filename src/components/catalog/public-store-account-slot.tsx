"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { House, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { shopperLogoutAction } from "@/app/acceso/actions";
import type { SessionUser } from "@/lib/auth";
import { usePublicStoreHeaderState } from "@/components/catalog/public-store-header-shell";

type AccountRole = SessionUser["role"] | undefined;

type AccountLinkItem = {
  label: string;
  href: string;
  icon: typeof UserRound;
};

function AccountHomeLink() {
  return (
    <Link
      className="public-store-quick-link public-store-home-link public-store-account-switch-link public-store-account-switch-home-link"
      href="/"
      aria-label="Volver al inicio"
    >
      <House size={16} />
      <span>Inicio</span>
    </Link>
  );
}

function AccountPopover({
  canLogout = false,
  items,
  triggerLabel,
}: {
  canLogout?: boolean;
  items: AccountLinkItem[];
  triggerLabel: string;
}) {
  return (
    <details className="account-popover public-store-account-popover">
      <summary className="public-store-quick-link account-popover-trigger">
        <UserRound size={16} />
        <span>{triggerLabel}</span>
      </summary>

      <div className="account-popover-menu">
        {items.map((item) => (
          <Link className="account-popover-link" href={item.href} key={item.href}>
            <item.icon size={16} />
            {item.label}
          </Link>
        ))}

        {canLogout ? (
          <form action={shopperLogoutAction}>
            <button className="account-popover-link account-popover-button" type="submit">
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

export function PublicStoreAccountSlot({ role }: { role?: AccountRole }) {
  const { collapsed } = usePublicStoreHeaderState();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 920px)");

    const updateMobileState = () => {
      setIsMobile(media.matches);
    };

    updateMobileState();
    media.addEventListener("change", updateMobileState);

    return () => {
      media.removeEventListener("change", updateMobileState);
    };
  }, []);

  const primaryAction =
    role === "ADMIN" ? (
      <Link className="public-store-quick-link public-store-account-switch-link" href="/admin">
        <LayoutDashboard size={16} />
        <span>Panel admin</span>
      </Link>
    ) : role === "USERSHOP" ? (
      <AccountPopover
        canLogout
        triggerLabel="Mi cuenta"
        items={[{ label: "Mi cuenta", href: "/cuenta", icon: UserRound }]}
      />
    ) : (
      <AccountPopover
        triggerLabel="Login"
        items={[
          { label: "Login Administrador", href: "/login", icon: UserRound },
          { label: "Login Cliente", href: "/acceso?mode=login", icon: UserRound },
          { label: "Crear cuenta", href: "/acceso?mode=register", icon: UserRound },
        ]}
      />
    );

  return (
    <div className="public-store-account-shell">
      <div className={`public-store-account-switch public-store-account-switch-desktop${collapsed ? " is-collapsed" : ""}`}>
        <div className="public-store-account-switch-row">
          <AccountHomeLink />
          {primaryAction}
        </div>
      </div>

      {isMobile ? (
        <div className="public-store-account-mobile-rail">
          <AccountHomeLink />
          {primaryAction}
        </div>
      ) : null}
    </div>
  );
}
