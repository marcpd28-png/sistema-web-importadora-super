import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { telegramCommand } from "@/lib/telegram-bridge";
import { requireAdmin } from "@/lib/auth";
import { getAssignableAdvisors } from "@/lib/messages-service";

export const dynamic = "force-dynamic";
export default async function TelegramPage() {
  const [session, advisors] = await Promise.all([requireAdmin(), getAssignableAdvisors()]);
  let connected = false;
  try { connected = (await telegramCommand<{ connected: boolean }>("status")).connected; } catch { /* Show actual availability without exposing configuration. */ }
  return <div className="messages-inbox-page">
    <header className="messages-page-header"><div>
      <p className="eyebrow">Centro de Mensajes</p><h1>Telegram</h1>
      <p>Atiende a los clientes de Super Importaciones desde esta bandeja.</p>
    </div><span className="messages-live-indicator"><i aria-hidden="true" />{connected ? 'Telegram conectado' : 'Conexión no disponible'}</span></header>
    <div className="messages-inbox-workspace"><MessagesWorkspace
      advisorTargets={advisors}
      initialChannel="TELEGRAM"
      viewer={{ id: session.userId, name: session.name, isMessagingOwner: true }}
    /></div>
  </div>;
}
