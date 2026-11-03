import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { canUseMessageCenter, requireAdvisor } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdvisorInboxPage() {
  const session = await requireAdvisor();
  if (!canUseMessageCenter(session)) redirect("/asesor");

  return (
    <div className="messages-inbox-page">
      <header className="messages-page-header">
        <div>
          <p className="eyebrow">Atención comercial</p>
          <h1>Centro de mensajes</h1>
          <p>Consulta y responde conversaciones de clientes. Las automatizaciones y configuraciones permanecen protegidas.</p>
        </div>
        <span className="messages-live-indicator"><i aria-hidden="true" />Actualización activa</span>
      </header>
      <div className="messages-inbox-workspace"><MessagesWorkspace canManageBot={false} uploadEndpoint="/api/asesor/mensajes/uploads" /></div>
    </div>
  );
}
