export const dynamic = "force-dynamic";
import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { requireAdmin } from "@/lib/auth";
import { getAssignableAdvisors } from "@/lib/messages-service";

export default async function InboxPage() {
  const [session, advisors] = await Promise.all([requireAdmin(), getAssignableAdvisors()]);

  return (
    <div className="messages-inbox-page">
      <header className="messages-page-header">
        <div>
          <p className="eyebrow">Conversaciones</p>
          <h1>Bandeja de entrada</h1>
          <p>Lee, responde y da seguimiento a tus clientes en tiempo real.</p>
        </div>
        <span className="messages-live-indicator"><i aria-hidden="true" />Actualización activa</span>
      </header>
      
      <div className="messages-inbox-workspace">
        <MessagesWorkspace
          advisorTargets={advisors}
          viewer={{ id: session.userId, name: session.name, isMessagingOwner: true }}
        />
      </div>
    </div>
  );
}
