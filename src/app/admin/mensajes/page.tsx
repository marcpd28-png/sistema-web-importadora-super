import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { Metadata } from "next";
import "./messages.css";

export const metadata: Metadata = {
  title: "Centro de Mensajes | Admin",
  description: "Gestión de conversaciones y atención al cliente",
};

export default function MensajesPage() {
  return (
    <div className="stack" style={{ height: '100%' }}>
      <div>
        <h1 className="h2">Centro de Mensajes</h1>
        <p className="text-muted">Gestiona todas las conversaciones con clientes desde un solo lugar.</p>
      </div>
      
      <MessagesWorkspace />
    </div>
  );
}
