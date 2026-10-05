"use client";

import { ArrowRight, DatabaseZap } from "lucide-react";
import { syncProductsFromErpAction } from "@/app/admin/actions";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ErpSyncLogView } from "@/lib/store-types";

type ErpSyncLiveProgressProps = {
  initialLog: ErpSyncLogView | null;
  latestLog: ErpSyncLogView | null;
};

const POLL_INTERVAL_MS = 5000;

function getModeLabel(syncMode: string) {
  switch (syncMode) {
    case "STOCK_ONLY":
      return "Solo stock";
    case "STOCK_PRICE":
      return "Rápida";
    case "NEW_ONLY":
      return "Solo nuevos";
    case "INCREMENTAL":
      return "Incremental";
    default:
      return "Completa";
  }
}

function getStatusLabel(status: ErpSyncLogView["status"]) {
  switch (status) {
    case "SUCCESS":
      return "Correcta";
    case "ERROR":
      return "Con error";
    case "CANCELED":
      return "Cancelada";
    default:
      return "En proceso";
  }
}

function formatDatetime(value: string | null) {
  if (!value) {
    return "Sin dato";
  }

  return new Intl.DateTimeFormat("es-PE", {
    hour12: true,
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ErpSyncLiveProgress({ initialLog, latestLog }: ErpSyncLiveProgressProps) {
  const [activeLog, setActiveLog] = useState<ErpSyncLogView | null>(initialLog);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        setLoading(true);
        const response = await fetch("/api/admin/erp/progress", { cache: "no-store" });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          activeLog: ErpSyncLogView | null;
        };

        if (!cancelled) {
          setActiveLog(payload.activeLog);
        }
      } catch {
        // Silencioso: el panel no debe romper por fallos de red temporales.
      } finally {
        if (!cancelled) {
          setLoading(false);
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    timeoutId = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const progressPercent = useMemo(() => {
    if (!activeLog?.progressTotalCount) {
      return activeLog?.status === "SUCCESS" ? 100 : 0;
    }

    return Math.min(100, Math.round((activeLog.processedCount / activeLog.progressTotalCount) * 100));
  }, [activeLog]);

  if (!activeLog) {
    return (
      <section className="erp-progress-card erp-progress-idle">
        <div className="erp-progress-head">
          <div>
            <p className="eyebrow">ERP en vivo</p>
            <h3>Sincronización lista para arrancar</h3>
          </div>
          <span className="sync-status-badge sync-status-success">Sin actividad</span>
        </div>

        <p className="erp-progress-copy">
          No hay una ejecución corriendo. Puedes lanzar una actualización rápida de stock/precio o una sincronización completa.
        </p>

        <div className="erp-progress-idle-summary">
          <div className="erp-progress-idle-summary-row">
            <span>Estado</span>
            <strong>{latestLog ? "Conectado y en espera" : "Pendiente de primera sync"}</strong>
          </div>
          <div className="erp-progress-idle-summary-row">
            <span>Última actividad</span>
            <strong>{latestLog ? formatDatetime(latestLog.updatedAt) : "Sin ejecuciones aún"}</strong>
          </div>
          <div className="erp-progress-idle-summary-row">
            <span>Último modo</span>
            <strong>{latestLog ? getModeLabel(latestLog.syncMode) : "Sin registro"}</strong>
          </div>
        </div>

        <div className="erp-progress-idle-actions">
          <form action={syncProductsFromErpAction}>
            <input name="returnTo" type="hidden" value="/admin/erp" />
            <input name="syncMode" type="hidden" value="STOCK_ONLY" />
            <SubmitButton className="erp-progress-idle-primary" pendingLabel="Iniciando...">
              Solo stock
            </SubmitButton>
          </form>

          <form action={syncProductsFromErpAction}>
            <input name="returnTo" type="hidden" value="/admin/erp" />
            <input name="syncMode" type="hidden" value="FULL" />
            <SubmitButton className="button button-secondary button-chip erp-progress-idle-secondary" pendingLabel="Iniciando...">
              <DatabaseZap size={16} />
              Sincronización completa
            </SubmitButton>
          </form>

          <Link className="button button-ghost button-chip erp-progress-idle-link" href="#erp-history">
            <ArrowRight size={16} />
            Ver historial
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="erp-progress-card">
      <div className="erp-progress-head">
        <div>
          <p className="eyebrow">ERP en vivo</p>
          <h3>{getStatusLabel(activeLog.status)}</h3>
        </div>
        <span className={`sync-status-badge sync-status-${activeLog.status.toLowerCase()}`}>
          {getModeLabel(activeLog.syncMode)}
        </span>
      </div>

      <div className="erp-progress-meta">
        <span>
          {activeLog.source} · {formatDatetime(activeLog.startedAt)}
        </span>
        <span>Actualizado {formatDatetime(activeLog.updatedAt)}</span>
      </div>

      <div className="erp-progress-bar" aria-label="Progreso de sincronización">
        <div className="erp-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="erp-progress-stats">
        <span>
          {activeLog.processedCount}/{activeLog.progressTotalCount || activeLog.fetchedCount} procesados
        </span>
        <span>{progressPercent}%</span>
      </div>

      <div className="erp-progress-grid">
        <span>Recibidos {activeLog.fetchedCount}</span>
        <span>Creados {activeLog.createdCount}</span>
        <span>Actualizados {activeLog.updatedCount}</span>
        <span>Omitidos {activeLog.skippedCount}</span>
        <span>Errores {activeLog.errorCount}</span>
      </div>

      {activeLog.errorMessage ? <p className="sync-log-error">{activeLog.errorMessage}</p> : null}
      {activeLog.failedPage ? (
        <p className="erp-progress-copy">
          Página fallida: {activeLog.failedPage}
          {activeLog.failedPageMessage ? ` · ${activeLog.failedPageMessage}` : ""}
        </p>
      ) : null}
      {loading ? <p className="erp-progress-copy">Actualizando...</p> : null}
    </section>
  );
}
