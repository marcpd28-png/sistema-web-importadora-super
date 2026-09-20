import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { getPublicSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./storefront-responsive.css";
import "./storefront-discovery.css";

const displayFont = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: {
    template: "%s | Importaciones Super",
    default: "Catálogo Mayorista | Importaciones Super",
  },
  description: "Catálogo mayorista de Importaciones Super. Compra directa y cotizaciones por WhatsApp.",
  icons: {
    icon: "/icon.png",
  },
  openGraph: {
    title: "Importaciones Super",
    description: "Catálogo mayorista con cotizaciones por WhatsApp.",
    url: "/",
    siteName: "Importaciones Super",
    locale: "es_PE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Importaciones Super",
    description: "Catálogo mayorista con cotizaciones por WhatsApp.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `if (localStorage.getItem("admin-sidebar-collapsed") === "true") { document.body.classList.add("admin-sidebar-collapsed"); }`
          }}
        />
        {children}
      </body>
    </html>
  );
}
