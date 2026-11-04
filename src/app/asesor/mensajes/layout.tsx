import { redirect } from "next/navigation";
import { canUseMessageCenter, requireAdvisor } from "@/lib/auth";
import "../../admin/mensajes/messages.css";
import "../../admin/mensajes/messages-compact.css";

export default async function AdvisorMessagesLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdvisor();

  if (!canUseMessageCenter(session)) {
    redirect("/asesor");
  }

  return <div className="messages-app-shell"><div className="messages-app-content">{children}</div></div>;
}
