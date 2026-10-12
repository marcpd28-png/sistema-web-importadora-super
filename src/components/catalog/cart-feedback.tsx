"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const CART_FEEDBACK_EVENT = "store-cart:added";

type CartFeedbackDetail = {
  productName: string;
  quantity: number;
};

export function announceCartAddition(detail: CartFeedbackDetail) {
  window.dispatchEvent(new CustomEvent<CartFeedbackDetail>(CART_FEEDBACK_EVENT, { detail }));
}

export function CartFeedback() {
  const [message, setMessage] = useState<CartFeedbackDetail | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<CartFeedbackDetail>).detail;
      if (!detail?.productName) return;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      setMessage(detail);
      timeoutRef.current = window.setTimeout(() => setMessage(null), 3600);
    };
    window.addEventListener(CART_FEEDBACK_EVENT, show);
    return () => {
      window.removeEventListener(CART_FEEDBACK_EVENT, show);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="store-cart-feedback" aria-live="polite" role="status">
      <CheckCircle2 aria-hidden="true" size={20} />
      <span><strong>Producto agregado correctamente</strong><small>{message.quantity > 1 ? `${message.quantity} unidades de ` : ""}{message.productName} ya está en tu carrito.</small></span>
    </div>
  );
}
