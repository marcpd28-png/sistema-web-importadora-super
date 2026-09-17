import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, XCircle, Clock, PauseCircle } from "lucide-react";

const executionLabels: Record<string, string> = {
  SUCCESS: "Completado", FAILED: "Fallido", RUNNING: "En curso", QUEUED: "En cola", SKIPPED: "Omitido",
};

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const logs = await prisma.automationExecution.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: {
      automation: {
        select: { name: true, channel: true }
      }
    }
  });

  return (
    <div style={{ padding: "24px", maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "24px" }}>Actividad y Logs</h1>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>Historial de disparadores y automatizaciones ejecutadas (n8n).</p>
      </div>

      <div style={{ background: "var(--surface-bg)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "16px" }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
            No se han registrado ejecuciones recientes.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: "flex", gap: "16px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "8px", background: "var(--bg)" }}>
                <div style={{ marginTop: "2px" }}>
                  {log.status === "SUCCESS" && <CheckCircle2 color="#22c55e" size={20} />}
                  {log.status === "FAILED" && <XCircle color="#ef4444" size={20} />}
                  {["RUNNING", "QUEUED"].includes(log.status) && <Clock color="#eab308" size={20} />}
                  {log.status === "SKIPPED" && <PauseCircle color="#6b7280" size={20} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <h3 style={{ margin: 0, fontWeight: 500, color: "var(--text)" }}>{log.automation.name}</h3>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      {format(log.startedAt, "dd MMM, HH:mm:ss", { locale: es })}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "var(--text-muted)" }}>Canal: {log.automation.channel} · {executionLabels[log.status] || log.status}</p>
                  
                  {log.error && (
                    <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c", padding: "8px 12px", borderRadius: "4px", border: "1px solid rgba(239, 68, 68, 0.2)", fontSize: "12px", fontFamily: "monospace", overflowX: "auto" }}>
                      {log.error}
                    </div>
                  )}
                  
                  {log.status === "SUCCESS" && log.providerExecutionId && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                      n8n Execution ID: {log.providerExecutionId}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
