import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

const displayFont = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Importaciones Super",
  description: "Catálogo mayorista con panel administrativo y pedidos por WhatsApp.",
  icons: {
    icon: "/icon.png",
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
