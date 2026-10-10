import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { telegramCommand } from "@/lib/telegram-bridge";

export const dynamic = "force-dynamic";
export default async function TelegramPage() {
  let connected = false;
  try { connected = (await telegramCommand<{ connected: boolean }>("status")).connected; } catch { /* Show actual availability without exposing configuration. */ }
  return <div className="messages-inbox-page">
    <header className="messages-page-header"><div>
      <p className="eyebrow">Centro de Mensajes</p><h1>Telegram</h1>
      <p>Atiende a los clientes de Super Importaciones desde esta bandeja.</p>
    </div><span className="messages-live-indicator"><i aria-hidden="true" />{connected ? 'Telegram conectado' : 'Conexión no disponible'}</span></header>
    <div className="messages-inbox-workspace"><MessagesWorkspace initialChannel="TELEGRAM" /></div>
  </div>;
}
