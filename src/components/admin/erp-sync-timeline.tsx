import { BadgeCheck, DatabaseZap, PackageSearch, PlayCircle, Shuffle, Truck } from "lucide-react";
import type { ErpSyncLogView } from "@/lib/store-types";
import { cn } from "@/lib/utils";

type ErpSyncTimelineProps = {
  log: ErpSyncLogView | null;
  latestLog: ErpSyncLogView | null;
};

const steps = [
  { key: "consulting", label: "Consultando ERP", icon: Truck },
  { key: "normalizing", label: "Normalizando productos", icon: PackageSearch },
  { key: "categorizing", label: "Resolviendo categorías", icon: Shuffle },
  { key: "writing", label: "Escribiendo base de datos", icon: DatabaseZap },
  { key: "finishing", label: "Finalizando sync", icon: BadgeCheck },
] as const;

export function ErpSyncTimeline({ log, latestLog }: ErpSyncTimelineProps) {
  const progress = log?.progressPercent ?? (log?.status === "SUCCESS" ? 100 : 0);
  const activeIndex = Math.max(0, Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length)));
  const failed = log?.status === "ERROR";

  return (
    <section className="erp-timeline-card">
      <div className="erp-timeline-head">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h3>{log ? "Estado de sincronización" : "Pipeline en espera"}</h3>
        </div>
        <span className={cn("sync-status-badge", failed ? "sync-status-error" : log ? "sync-status-running" : "sync-status-success")}>
          {failed ? "Error" : log ? (log.status === "SUCCESS" ? "Completado" : "Procesando") : "Listo"}
        </span>
      </div>

      {!log ? (
        <div className="erp-timeline-idle">
          <div className="erp-timeline-idle-summary">
            <div className="erp-timeline-idle-summary-row">
              <span>Estado</span>
              <strong>{latestLog ? "Conectado" : "Pendiente"}</strong>
            </div>
            <div className="erp-timeline-idle-summary-row">
              <span>Última actividad</span>
              <strong>{latestLog ? new Intl.DateTimeFormat("es-PE", {
                hour12: true,
                timeZone: "America/Lima",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(latestLog.updatedAt)) : "Sin sync reciente"}</strong>
            </div>
            <div className="erp-timeline-idle-summary-row">
              <span>Último modo</span>
              <strong>{latestLog ? latestLog.syncMode : "Sin registro"}</strong>
            </div>
          </div>

          <div className="erp-timeline-idle-callout">
            <PlayCircle size={18} />
            <div>
              <strong>Pipeline listo para arrancar</strong>
              <span>Cuando lances una sync, aquí verás cada etapa con su progreso en tiempo real.</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="erp-timeline-track" aria-label="Pipeline de sincronización ERP">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index <= activeIndex && !failed;
          const isDone = progress >= 100 || index < activeIndex;
          const isIdle = !log;

          return (
            <article
              className={cn("erp-timeline-step", isActive && "is-active", isDone && "is-done", failed && "is-failed", isIdle && "is-idle")}
              key={step.key}
            >
              <span className="erp-timeline-icon">
                <Icon size={16} />
              </span>
              <div>
                <strong>{step.label}</strong>
                <span>
                  {isIdle
                    ? index === 0
                      ? "Pipeline disponible"
                      : "Pendiente"
                    : failed
                    ? log?.failedPage
                      ? `Falló en página ${log.failedPage}`
                      : "Falló durante la ejecución"
                    : isDone
                      ? "Procesado"
                      : isActive
                        ? "En progreso"
                        : "Pendiente"}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
