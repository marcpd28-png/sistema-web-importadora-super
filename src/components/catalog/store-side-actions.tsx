"use client";

import { StoreHomeLink } from "@/components/catalog/store-home-link";
import {
  House,
  ShoppingCart,
} from "lucide-react";
import { STORE_CART_OPEN_EVENT } from "@/components/catalog/cart-events";
import { useCartStore } from "@/components/catalog/cart-store";
import type { StoreSettingsView } from "@/lib/store";

const MESSENGER_CHAT_URL = "https://m.me/importacionessuperoficial";

type StoreSideActionsProps = {
  settings: Pick<StoreSettingsView, "businessName" | "supportHours" | "whatsappNumber">;
  showHomeShortcut?: boolean;
  showNormalViewShortcut?: boolean;
};

export function StoreSideActions({
  settings,
  showHomeShortcut = false,
  showNormalViewShortcut = false,
}: StoreSideActionsProps) {
  void settings;
  void showNormalViewShortcut;

  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0),
  );

  const openCart = () => {
    window.dispatchEvent(new CustomEvent(STORE_CART_OPEN_EVENT));
  };

  return (
    <div className="store-side-actions" aria-label="Accesos rápidos de tienda">
      <button
        aria-label={`Abrir carrito${itemCount > 0 ? `, ${itemCount} productos` : ""}`}
        className="store-side-action store-side-action-cart"
        title="Ver mi carrito"
        onClick={openCart}
        type="button"
      >
        <ShoppingCart size={24} />
        {itemCount > 0 ? <strong className="store-side-action-badge" aria-hidden="true">{itemCount > 99 ? "99+" : itemCount}</strong> : null}
        <span>Carrito</span>
      </button>

      {showHomeShortcut ? (
        <StoreHomeLink
          className="store-side-action store-side-action-home"
        >
          <House size={24} />
          <span>Inicio</span>
        </StoreHomeLink>
      ) : null}

      <a
        className="store-side-action store-side-action-messenger"
        href={MESSENGER_CHAT_URL}
        rel="noreferrer"
        target="_blank"
        aria-label="Abrir Messenger de Importaciones Super"
        title="Escríbenos por Messenger"
      >
        <svg
          aria-hidden="true"
          className="store-side-action-messenger-icon"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path clipRule="evenodd" d="M12 0C5.282 0 0 4.922 0 11.566c0 3.78 1.72 7.05 4.52 9.246V24l3.096-1.698c1.356.374 2.8.564 4.384.564 6.718 0 12-4.922 12-11.566S18.718 0 12 0Zm1.192 15.57-3.058-3.262-5.966 3.262 6.564-6.966 3.134 3.262 5.89-3.262-6.564 6.966Z" fillRule="evenodd" />
        </svg>
        <span>Messenger</span>
      </a>
    </div>
  );
}
