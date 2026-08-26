import type { Metadata } from "next";
import { headers } from "next/headers";
import { ServiceFeedbackQr } from "@/components/service-feedback-qr";
import { buildRequestUrl } from "@/lib/request-url";

export const metadata: Metadata = {
  title: "QR de atención | Importaciones Super",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ServiceFeedbackQrPage() {
  const requestHeaders = await headers();
  const initialUrl = buildRequestUrl(requestHeaders, "/califica-atencion");

  return <ServiceFeedbackQr initialUrl={initialUrl} />;
}
