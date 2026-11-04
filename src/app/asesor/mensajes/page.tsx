import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { canUseMessageCenter, requireAdvisor } from "@/lib/auth";
import { getAssignableAdvisors } from "@/lib/messages-service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdvisorInboxPage() {
  const session = await requireAdvisor();
  if (!canUseMessageCenter(session)) redirect("/asesor");
  const advisors = await getAssignableAdvisors();

  return (
    <div className="messages-inbox-page">
      <header className="messages-page-header">
        <div>
          <p className="eyebrow">Atención comercial</p>
          <h1>Centro de mensajes</h1>
          <p>Consulta y responde conversaciones de clientes. Los controles de Super Bot y la configuración permanecen protegidos.</p>
        </div>
        <span className="messages-live-indicator"><i aria-hidden="true" />Actualización activa</span>
      </header>
      <div className="messages-inbox-workspace"><MessagesWorkspace
        advisorTargets={advisors}
        canManageBot={false}
        uploadEndpoint="/api/asesor/mensajes/uploads"
        viewer={{ id: session.userId, name: session.name, isMessagingOwner: false }}
      /></div>
    </div>
  );
}
