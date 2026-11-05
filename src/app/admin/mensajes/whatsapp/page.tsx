import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { requireMessagingOwner } from "@/lib/auth";
import { getAssignableAdvisors } from "@/lib/messages-service";

export const dynamic = "force-dynamic";

export default async function WhatsAppInboxPage() {
  const [session, advisors] = await Promise.all([requireMessagingOwner(), getAssignableAdvisors()]);

  return (
    <div className="messages-inbox-page">
      <header className="messages-page-header">
        <div>
          <p className="eyebrow">Centro de Mensajes</p>
          <h1>WhatsApp</h1>
          <p>Consulta los mensajes entrantes de WhatsApp guardados en el centro de mensajes.</p>
        </div>
        <span className="messages-live-indicator"><i aria-hidden="true" />Bandeja de consulta</span>
      </header>
      <div className="messages-inbox-workspace">
        <MessagesWorkspace
          advisorTargets={advisors}
          initialChannel="WHATSAPP"
          readOnly
          viewer={{ id: session.userId, name: session.name, isMessagingOwner: true }}
        />
      </div>
    </div>
  );
}
