import { redirect } from "next/navigation";
import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { canUseMessageCenter, requireAdvisor } from "@/lib/auth";
import { getAssignableAdvisors } from "@/lib/messages-service";

export const dynamic = "force-dynamic";

export default async function AdvisorWhatsAppInboxPage() {
  const session = await requireAdvisor();
  if (!canUseMessageCenter(session)) redirect("/asesor");
  const advisors = await getAssignableAdvisors();

  return (
    <div className="messages-inbox-page">
      <header className="messages-page-header">
        <div>
          <p className="eyebrow">Atención comercial</p>
          <h1>Mensajes de WhatsApp</h1>
          <p>Consulta los mensajes entrantes de WhatsApp que estén asignados a tu cuenta.</p>
        </div>
        <span className="messages-live-indicator"><i aria-hidden="true" />Bandeja de consulta</span>
      </header>
      <div className="messages-inbox-workspace">
        <MessagesWorkspace
          advisorTargets={advisors}
          canManageBot={false}
          conversationApiBase="/api/asesor/mensajes/whatsapp/conversations"
          initialChannel="WHATSAPP"
          readOnly
          viewer={{ id: session.userId, name: session.name, isMessagingOwner: false }}
        />
      </div>
    </div>
  );
}
