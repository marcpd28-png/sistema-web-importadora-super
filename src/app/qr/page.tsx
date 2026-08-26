import type { Metadata } from "next";
import { headers } from "next/headers";
import { ServiceFeedbackQr } from "@/components/service-feedback-qr";
import { buildRequestUrl } from "@/lib/request-url";

export const metadata: Metadata = {
  title: "QR de tienda | Importaciones Super",
  robots: {
    index: false,
    follow: false,
  },
};

const STORE_QR_COPY = {
  formLabel: "Enlace de la tienda",
  localExamplePath: "/",
  posterDescription:
    "Explora productos, precios y stock actualizado desde tu celular. Arma tu pedido y solicita cotización en segundos.",
  posterEyebrow: "Catálogo digital",
  posterTitle: "Escanea y compra",
  posterTitleAccent: "en la tienda virtual",
  readyText: "Escanea el QR con un celular y confirma que abre el catálogo.",
  scanHint: "Abre la cámara de tu celular y apunta al código",
  toolsCopy:
    "Este QR abre directamente la tienda virtual. Úsalo para mostrador, empaques, vitrinas o material impreso.",
  toolsKicker: "Acceso rápido",
  toolsTitle: "QR de tienda",
};

export default async function StoreQrPage() {
  const requestHeaders = await headers();
  const initialUrl = buildRequestUrl(requestHeaders, "/");

  return <ServiceFeedbackQr copy={STORE_QR_COPY} initialUrl={initialUrl} />;
}
