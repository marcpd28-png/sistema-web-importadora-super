"use client";

import { StoreHomeLink } from "@/components/catalog/store-home-link";
import {
  House,
  MessageCircle,
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
        <MessageCircle className="store-side-action-messenger-icon" aria-hidden="true" size={32} />
        <span>Messenger</span>
      </a>
    </div>
  );
}
