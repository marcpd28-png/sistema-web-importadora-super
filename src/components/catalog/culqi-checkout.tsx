"use client";

import { useEffect, useCallback } from "react";
import Script from "next/script";

declare global {
  interface Window {
    Culqi: any;
    culqi: () => void;
  }
}

type CulqiCheckoutProps = {
  publicKey: string;
  amount: number; // En céntimos
  currency: string;
  title: string;
  onToken: (token: string) => void;
  onError: (error: string) => void;
  isOpen: boolean;
  onClose: () => void;
};

export function CulqiCheckout({
  publicKey,
  amount,
  currency,
  title,
  onToken,
  onError,
  isOpen,
  onClose,
}: CulqiCheckoutProps) {
  const initCulqi = useCallback(() => {
    if (typeof window === "undefined" || !window.Culqi) return;
    
    window.Culqi.publicKey = publicKey;
    window.Culqi.settings({
      title: title,
      currency: currency,
      amount: amount,
    });
    window.Culqi.options({
      lang: "auto",
      modal: true,
      installments: false,
    });
    
    if (isOpen) {
      window.Culqi.open();
    }
  }, [publicKey, amount, currency, title, isOpen]);

  useEffect(() => {
    if (isOpen) {
      initCulqi();
    }
  }, [isOpen, initCulqi]);

  useEffect(() => {
    // Definir la función global que Culqi llama al terminar
    window.culqi = () => {
      if (window.Culqi.token) {
        const token = window.Culqi.token.id;
        onToken(token);
      } else if (window.Culqi.order) {
        // En caso de usar Yape o PagoEfectivo sin tarjeta directo
        const order = window.Culqi.order;
      } else {
        onError(window.Culqi.error?.user_message || "Error al procesar el pago");
      }
      onClose();
    };

    // Al cerrar el modal de Culqi
    const handleCulqiClose = setInterval(() => {
      if (isOpen && window.Culqi && !window.Culqi.isOpen) {
        onClose();
      }
    }, 500);

    return () => {
      clearInterval(handleCulqiClose);
    };
  }, [onToken, onError, onClose, isOpen]);

  return (
    <Script
      src="https://checkout.culqi.com/js/v4"
      strategy="afterInteractive"
      onLoad={() => {
        if (isOpen) initCulqi();
      }}
    />
  );
}
