import { Metadata } from "next";
import { requireMessagingOwner } from "@/lib/auth";
import { MessagesSidebar } from "@/components/admin/messages/layout/MessagesSidebar";
import "./messages.css";
import "./messages-compact.css";

export const metadata: Metadata = {
  title: "Plataforma Conversacional | Importadora Super",
  description: "Bandeja y controles de Super Bot",
};

export default async function MensajesSaaSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMessagingOwner();

  return (
    <div className="messages-app-shell">
      <MessagesSidebar />
      <div className="messages-app-content">
        {children}
      </div>
    </div>
  );
}
