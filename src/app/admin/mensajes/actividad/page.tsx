import { SuperBotEventStatus } from "@prisma/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Activity, Bot, CheckCircle2, CirclePause, Clock3, MessageCircleMore, TriangleAlert, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSuperBotOperationsSummary } from "@/lib/super-bot-telemetry";

export const dynamic = "force-dynamic";

const eventPresentation = {
  PROCESSING: { label: "En proceso", color: "#a16207", Icon: Clock3 },
  RESPONDED: { label: "Respondido", color: "#15803d", Icon: CheckCircle2 },
  PAUSED: { label: "Pausado", color: "#a16207", Icon: CirclePause },
  FAILED: { label: "Falló", color: "#b91c1c", Icon: XCircle },
} satisfies Record<SuperBotEventStatus, { label: string; color: string; Icon: typeof Activity }>;

function metric(label: string, value: string | number, tone = "var(--text)") {
  return (
    <div style={{ minWidth: 132, flex: "1 1 132px", border: "1px solid var(--border-color)", borderRadius: 10, padding: "14px 16px", background: "var(--bg)" }}>
      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>{label}</p>
      <strong style={{ display: "block", marginTop: 6, color: tone, fontSize: 23 }}>{value}</strong>
    </div>
  );
}

export default async function ActividadPage() {
  const [summary, events, storedMessages] = await Promise.all([
    getSuperBotOperationsSummary(),
    prisma.superBotEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        channel: true,
        conversationRef: true,
        status: true,
        intent: true,
        productsCount: true,
        latencyMs: true,
        errorCode: true,
        createdAt: true,
      },
    }),
    prisma.chatMessage.findMany({
      where: {
        senderType: "BOT",
        conversation: { channel: { in: ["WEB", "TELEGRAM"] } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        conversation: { include: { contact: { select: { name: true } } } },
      },
    }),
  ]);

  return (
    <div style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Actividad de Super Bot</h1>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>
          Operación automática de los canales conectados. No se replica aquí el texto del cliente: ChatbotX sigue siendo la fuente de la conversación.
        </p>
      </div>

      <section aria-label="Métricas de las últimas 24 horas" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {metric("Eventos en 24 h", summary.total)}
        {metric("Respondidos", summary.responded, "#15803d")}
        {metric("Pausados", summary.paused, "#a16207")}
        {metric("Fallidos", summary.failed, summary.failed ? "#b91c1c" : "var(--text)")}
        {metric("Latencia media", summary.averageLatencyMs === null ? "—" : `${summary.averageLatencyMs} ms`)}
      </section>

      <section style={{ background: "var(--surface-bg)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Activity size={19} color="var(--primary)" />
          <h2 style={{ margin: 0, fontSize: 17 }}>Trazabilidad de respuestas automáticas</h2>
        </div>
        {events.length === 0 ? (
          <p style={{ textAlign: "center", padding: "34px 0", color: "var(--text-muted)", margin: 0 }}>
            Aún no hay eventos automáticos. Cuando ChatbotX consulte Super Bot, aparecerán aquí.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map((event) => {
              const presentation = eventPresentation[event.status];
              const StatusIcon = presentation.Icon;
              return (
                <article key={event.id} style={{ display: "flex", gap: 12, padding: 14, border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--bg)" }}>
                  <StatusIcon color={presentation.color} size={20} style={{ flex: "0 0 auto", marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                      <strong style={{ color: presentation.color }}>{presentation.label}</strong>
                      <time style={{ color: "var(--text-muted)", fontSize: 12 }} dateTime={event.createdAt.toISOString()}>
                        {format(event.createdAt, "dd MMM, HH:mm:ss", { locale: es })}
                      </time>
                    </div>
                    <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
                      Canal: {event.channel} · {event.intent ? `Intención: ${event.intent}` : "Sin intención catalogada"} · {event.productsCount} producto{event.productsCount === 1 ? "" : "s"}
                      {event.latencyMs !== null ? ` · ${event.latencyMs} ms` : ""}
                    </p>
                    {event.conversationRef && <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 12 }}>Referencia de conversación: {event.conversationRef.slice(0, 12)}</p>}
                    {event.errorCode && (
                      <p style={{ display: "flex", gap: 6, alignItems: "center", color: "#b91c1c", margin: "7px 0 0", fontSize: 12 }}>
                        <TriangleAlert size={14} /> {event.errorCode}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ background: "var(--surface-bg)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Bot size={19} color="var(--primary)" />
          <h2 style={{ margin: 0, fontSize: 17 }}>Respuestas locales recientes</h2>
        </div>
        {storedMessages.length === 0 ? (
          <p style={{ textAlign: "center", padding: "28px 0", color: "var(--text-muted)", margin: 0 }}>Aún no hay respuestas locales guardadas.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {storedMessages.map((message) => (
              <article key={message.id} style={{ display: "flex", gap: 12, padding: 14, border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--bg)" }}>
                <MessageCircleMore color="var(--primary)" size={20} style={{ flex: "0 0 auto", marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>{message.conversation.contact.name}</strong>
                    <time style={{ color: "var(--text-muted)", fontSize: 12 }} dateTime={message.createdAt.toISOString()}>{format(message.createdAt, "dd MMM, HH:mm:ss", { locale: es })}</time>
                  </div>
                  <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 12 }}>Canal: {message.conversation.channel}</p>
                  <p style={{ margin: "7px 0 0", whiteSpace: "pre-wrap" }}>{message.content || "Respuesta con archivo adjunto"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
