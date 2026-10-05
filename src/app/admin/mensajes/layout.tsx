import { Metadata } from "next";
import { MessagesSidebar } from "@/components/admin/messages/layout/MessagesSidebar";
import "./messages.css";
import "./messages-compact.css";

export const metadata: Metadata = {
  title: "Plataforma Conversacional | Importadora Super",
  description: "Bandeja y Automatizaciones SaaS",
};

export default function MensajesSaaSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="messages-app-shell">
      <MessagesSidebar />
      <div className="messages-app-content">
        {children}
      </div>
    </div>
  );
}
