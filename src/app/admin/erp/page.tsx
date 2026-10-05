import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, Clock3, DatabaseZap, Gauge, RefreshCw, Sparkles, Truck } from "lucide-react";
import {
  cancelErpSyncAction,
  syncProductsFromErpAction,
} from "@/app/admin/actions";
import { ErpSyncLiveProgress } from "@/components/admin/erp-sync-live-progress";
import { ErpSyncModeCard } from "@/components/admin/erp-sync-mode-card";
import { ErpSyncTimeline } from "@/components/admin/erp-sync-timeline";
import { SyncDuration } from "@/components/admin/sync-duration";
import { SubmitButton } from "@/components/ui/submit-button";
import { getRecentErpSyncLogs, type ErpSyncLogView } from "@/lib/store";
import { cn } from "@/lib/utils";

type ErpPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  hour12: true,
  timeZone: "America/Lima",
  dateStyle: "medium",
  timeStyle: "short",
});

function getTriggerLabel(trigger: ErpSyncLogView["trigger"]) {
  switch (trigger) {
    case "MANUAL":
      return "Manual";
    case "AUTOMATIC":
      return "Automática";
    default:
      return "Script";
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

function getStatusTone(status: ErpSyncLogView["status"]) {
  switch (status) {
    case "SUCCESS":
      return "sync-status-success";
    case "ERROR":
      return "sync-status-error";
    case "CANCELED":
      return "sync-status-canceled";
    default:
      return "sync-status-running";
  }
}

function getModeLabel(syncMode: string) {
  switch (syncMode) {
    case "STOCK_ONLY":
      return "Solo stock";
    case "STOCK_PRICE":
      return "Rápida stock/precio";
    case "INCREMENTAL":
      return "Incremental real";
    case "NEW_ONLY":
      return "Solo nuevos";
    default:
      return "Completa";
  }
}

function getModeDescription(syncMode: string) {
  switch (syncMode) {
    case "STOCK_ONLY":
      return "Refresca solo el stock y la disponibilidad visible.";
    case "STOCK_PRICE":
      return "Refresca disponibilidad comercial sin tocar el contenido pesado.";
    case "INCREMENTAL":
      return "Toma solo diferencias reales desde el último checkpoint.";
    case "NEW_ONLY":
      return "Vincula productos nuevos sin reescribir lo existente.";
    default:
      return "Actualiza catálogo, media, categorías y stock completo.";
  }
}

function getModeLabelShort(syncMode: string) {
  switch (syncMode) {
    case "STOCK_ONLY":
      return "Stock";
    case "STOCK_PRICE":
      return "Rápida";
    case "INCREMENTAL":
      return "Incremental";
    case "NEW_ONLY":
      return "Nuevos";
    default:
      return "Completa";
  }
}

function getErpHealthState(activeSyncLog: ErpSyncLogView | null, latestLog: ErpSyncLogView | null) {
  if (activeSyncLog) {
    return {
      label: "Conectado",
      tone: getStatusTone(activeSyncLog.status),
      description: `Sincronización ${getModeLabel(activeSyncLog.syncMode).toLowerCase()} en curso.`,
    };
  }

  if (latestLog?.status === "ERROR") {
    return {
      label: "Error reciente",
      tone: "sync-status-error",
      description: "La última lectura terminó con error y requiere revisión.",
    };
  }

  if (latestLog) {
    return {
      label: "Sin actividad",
      tone: "sync-status-success",
      description: "El ERP respondió y el catálogo quedó estable sin ejecución activa.",
    };
  }

  return {
    label: "Pendiente",
    tone: "sync-status-canceled",
    description: "Aún no hay una sincronización registrada en este entorno.",
  };
}

export default async function ErpPage({ searchParams }: ErpPageProps) {
  const syncLogs = await getRecentErpSyncLogs(8);
  const activeSyncLog = syncLogs.find((log) => log.status === "RUNNING") ?? null;
  const latestLog = syncLogs[0] ?? null;
  const erpApiUrl = process.env.FACTURADOR_API_URL?.trim() || "ERP no configurado";
  const params = searchParams ? await searchParams : undefined;
  const syncStatus = typeof params?.syncStatus === "string" ? params.syncStatus : "";
  const syncError = typeof params?.syncError === "string" ? params.syncError : "";
  const syncMode = typeof params?.syncMode === "string" ? params.syncMode : "";
  const fetched = Number(typeof params?.fetched === "string" ? params.fetched : "0");
  const created = Number(typeof params?.created === "string" ? params.created : "0");
  const updated = Number(typeof params?.updated === "string" ? params.updated : "0");
  const skipped = Number(typeof params?.skipped === "string" ? params.skipped : "0");
  const syncModeLabel =
    syncMode === "STOCK_ONLY"
      ? "solo stock"
      : syncMode === "STOCK_PRICE"
      ? "rápida de stock/precio"
      : syncMode === "INCREMENTAL"
        ? "incremental real"
        : syncMode === "NEW_ONLY"
          ? "solo vincular nuevos"
          : "sincronización completa";

  const lastSyncedAt = latestLog?.finishedAt ?? latestLog?.updatedAt ?? null;
  const failedLog = syncLogs.find((log) => log.failedPage || log.status === "ERROR") ?? null;
  const erpHealth = getErpHealthState(activeSyncLog, latestLog);
  const looksLikeConnectivityIssue = Boolean(
    latestLog?.errorMessage &&
      /fetch failed|timed out|timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|No se pudo conectar/i.test(
        latestLog.errorMessage,
      ),
  );

  const recentModes = [
    { mode: "FULL", label: getModeLabel("FULL"), count: syncLogs.filter((log) => log.syncMode === "FULL").length },
    { mode: "STOCK_ONLY", label: getModeLabel("STOCK_ONLY"), count: syncLogs.filter((log) => log.syncMode === "STOCK_ONLY").length },
    { mode: "STOCK_PRICE", label: getModeLabel("STOCK_PRICE"), count: syncLogs.filter((log) => log.syncMode === "STOCK_PRICE").length },
    { mode: "NEW_ONLY", label: getModeLabel("NEW_ONLY"), count: syncLogs.filter((log) => log.syncMode === "NEW_ONLY").length },
    { mode: "INCREMENTAL", label: getModeLabel("INCREMENTAL"), count: syncLogs.filter((log) => log.syncMode === "INCREMENTAL").length },
  ];

  const syncGuideRows = [
    {
      mode: "STOCK_ONLY",
      scope: "Stock y disponibilidad.",
      cadence: "Cada 1 minuto",
      type: "Automática",
      eta: "Segundos a pocos minutos por ventana.",
    },
    {
      mode: "STOCK_PRICE",
      scope: "Stock + precio unitario + mayorista.",
      cadence: "Cada 5 minutos",
      type: "Automática",
      eta: "Segundos a pocos minutos por ventana.",
    },
    {
      mode: "FULL",
      scope: "Catálogo completo, media, categorías y stock.",
      cadence: "Cada 60 minutos",
      type: "Automática",
      eta: "Varios minutos, según lote y throttle.",
    },
    {
      mode: "NEW_ONLY",
      scope: "Solo productos nuevos que aún no existen.",
      cadence: "Manual",
      type: "Bajo demanda",
      eta: "Depende del lote nuevo a vincular.",
    },
    {
      mode: "INCREMENTAL",
      scope: "Cambios reales desde el último checkpoint.",
      cadence: "Manual",
      type: "Bajo demanda",
      eta: "Normalmente el más eficiente para cambios.",
    },
  ];

  return (
    <section className="admin-erp-page stack-lg">
      <section className="panel admin-erp-hero">
        <div className="admin-erp-hero-copy">
          <p className="eyebrow">ERP control center</p>
          <h1>Sincronización operativa del catálogo</h1>
          <p className="panel-copy">
            Seguimiento en vivo, pipeline visual, historial auditable y modos de sincronización pensados para operar como plataforma.
          </p>
          <div className="admin-erp-hero-actions">
            <Link className="button button-secondary button-chip" href="#erp-live">
              <Gauge size={16} />
              Ver en vivo
            </Link>
            <Link className="button button-secondary button-chip" href="#erp-history">
              <DatabaseZap size={16} />
              Historial
            </Link>
            <Link className="button button-ghost button-chip" href="/admin/products?issue=review">
              <AlertTriangle size={16} />
              Alertas
            </Link>
          </div>
        </div>

        <div className="admin-erp-hero-stats">
          <div className="admin-erp-stat-card">
            <span>Última sincronización</span>
            <strong>{lastSyncedAt ? dateFormatter.format(new Date(lastSyncedAt)) : "Sin registro"}</strong>
            <p>Fuente {latestLog?.source ?? "ERP"} · {latestLog ? getStatusLabel(latestLog.status) : "Sin bitácora"}</p>
          </div>
          <div className="admin-erp-stat-card">
            <span>Procesamiento actual</span>
            <strong>{activeSyncLog ? `${activeSyncLog.processedCount}/${activeSyncLog.progressTotalCount || activeSyncLog.fetchedCount}` : "0/0"}</strong>
            <p>{activeSyncLog ? getModeLabel(activeSyncLog.syncMode) : "Sin ejecución activa"}</p>
          </div>
          <div className="admin-erp-stat-card">
            <span>Salud de sync</span>
            <strong className={cn(erpHealth.tone)}>
              {erpHealth.label}
            </strong>
            <p>{erpHealth.description}</p>
          </div>
        </div>
      </section>

      {syncStatus === "success" ? (
        <p className="success-text">
          Sincronización completada ({syncModeLabel}). Recibidos: {fetched} · creados: {created} · actualizados: {updated} · omitidos: {skipped}
        </p>
      ) : null}
      {syncStatus === "running" ? (
        <p className="success-text">
          Sincronización iniciada en segundo plano ({syncModeLabel}). Puedes seguir navegando.
        </p>
      ) : null}
      {syncStatus === "error" ? <p className="error-text auth-error">{syncError}</p> : null}
      {syncStatus === "cancelled" ? <p className="success-text">La sincronización fue cancelada desde el panel.</p> : null}
      {looksLikeConnectivityIssue ? (
        <section className="panel admin-erp-connection-alert">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ERP sin conexión</p>
              <h2>El host configurado no responde</h2>
            </div>
            <span className="pill">{erpHealth.label}</span>
          </div>
          <div className="admin-erp-connection-grid">
            <article>
              <span>Endpoint</span>
              <strong>{erpApiUrl}</strong>
            </article>
            <article>
              <span>Último error</span>
              <strong>{latestLog?.failedPageMessage || latestLog?.errorMessage || "Sin detalle"}</strong>
            </article>
          </div>
          <p className="panel-copy">
            Ningún modo de sincronización puede completar si el ERP no responde a la primera página.
            Revisa URL, token, DNS o firewall antes de volver a lanzar FULL, Solo stock, Rápida, Solo nuevos o Incremental.
          </p>
        </section>
      ) : null}

      <section className="panel admin-erp-guide-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Guía rápida</p>
            <h2>Cómo funciona la sincronización</h2>
          </div>
          <span className="muted">Automática + manual</span>
        </div>

        <div className="admin-erp-guide-table-wrap">
          <table className="admin-erp-guide-table">
            <thead>
              <tr>
                <th>Modo</th>
                <th>Qué actualiza</th>
                <th>Frecuencia</th>
                <th>Tipo</th>
                <th>Tiempo aprox.</th>
              </tr>
            </thead>
            <tbody>
              {syncGuideRows.map((row) => (
                <tr key={row.mode}>
                  <td>
                    <strong>{getModeLabel(row.mode)}</strong>
                    <span className="admin-erp-table-subtitle">{row.mode}</span>
                  </td>
                  <td>{row.scope}</td>
                  <td>{row.cadence}</td>
                  <td>
                    <span className={`sync-status-badge ${row.type === "Automática" ? "sync-status-success" : "sync-status-running"}`}>
                      {row.type}
                    </span>
                  </td>
                  <td>{row.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-erp-modes">
        <ErpSyncModeCard
          active={(activeSyncLog?.syncMode ?? "FULL") === "FULL"}
          description={getModeDescription("FULL")}
          label={getModeLabelShort("FULL")}
          title="Sincronización completa"
          tone="neutral"
        />
        <ErpSyncModeCard
          active={(activeSyncLog?.syncMode ?? syncMode) === "STOCK_ONLY"}
          description={getModeDescription("STOCK_ONLY")}
          label={getModeLabelShort("STOCK_ONLY")}
          title="Solo stock"
          tone="positive"
        />
        <ErpSyncModeCard
          active={(activeSyncLog?.syncMode ?? syncMode) === "STOCK_PRICE"}
          description={getModeDescription("STOCK_PRICE")}
          label={getModeLabelShort("STOCK_PRICE")}
          title="Stock / precio"
          tone="positive"
        />
        <ErpSyncModeCard
          active={(activeSyncLog?.syncMode ?? syncMode) === "NEW_ONLY"}
          description={getModeDescription("NEW_ONLY")}
          label={getModeLabelShort("NEW_ONLY")}
          title="Solo nuevos"
          tone="neutral"
        />
        <ErpSyncModeCard
          active={(activeSyncLog?.syncMode ?? syncMode) === "INCREMENTAL"}
          description={getModeDescription("INCREMENTAL")}
          label={getModeLabelShort("INCREMENTAL")}
          title="Incremental"
          tone="warning"
        />
      </section>

      <section className="admin-erp-grid" id="erp-live">
        <article className="panel admin-erp-action-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Acción operativa</p>
              <h2>Lanzar sync</h2>
            </div>
            <span className="sync-status-badge sync-status-running">Controlado</span>
          </div>

          <form action={syncProductsFromErpAction} className="admin-erp-form">
            <input name="returnTo" type="hidden" value="/admin/erp" />
            <label className="field sync-mode-field">
              <span>Modo de sincronización</span>
              <select
                defaultValue={
                  syncMode === "STOCK_ONLY"
                    ? "STOCK_ONLY"
                    : syncMode === "STOCK_PRICE"
                    ? "STOCK_PRICE"
                    : syncMode === "INCREMENTAL"
                      ? "INCREMENTAL"
                      : syncMode === "NEW_ONLY"
                        ? "NEW_ONLY"
                        : "FULL"
                }
                name="syncMode"
              >
                <option value="FULL">Sincronización completa</option>
                <option value="STOCK_ONLY">Solo stock (cada minuto)</option>
                <option value="STOCK_PRICE">Sincronización rápida de stock/precio</option>
                <option value="NEW_ONLY">Solo vincular nuevos</option>
                <option value="INCREMENTAL">Incremental real (requiere filtro ERP)</option>
              </select>
            </label>
            <SubmitButton pendingLabel="Sincronizando..." className="admin-erp-submit">
              Sincronizar desde ERP
            </SubmitButton>
          </form>

          <div className="admin-erp-note-grid">
            <div className="admin-erp-note">
              <Truck size={16} />
              <div>
                <strong>Pipeline</strong>
                <span>Consulta, normalización, categorías, escritura y cierre.</span>
              </div>
            </div>
            <div className="admin-erp-note">
              <RefreshCw size={16} />
              <div>
                <strong>Resiliencia</strong>
                <span>Retry por página con backoff y errores auditables.</span>
              </div>
            </div>
            <div className="admin-erp-note">
              <Clock3 size={16} />
              <div>
                <strong>Observabilidad</strong>
                <span>Progress en vivo, última actualización y páginas fallidas.</span>
              </div>
            </div>
          </div>
        </article>

        <ErpSyncLiveProgress initialLog={activeSyncLog} latestLog={latestLog} />
      </section>

      <section className="admin-erp-secondary-grid">
        <ErpSyncTimeline log={activeSyncLog} latestLog={latestLog} />

        <article className="panel admin-erp-side-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Última lectura</p>
              <h2>Estado resumido</h2>
            </div>
          </div>

          {latestLog ? (
            <div className="admin-erp-summary-list">
              <div className="admin-erp-summary-row">
                <span>Modo</span>
                <strong>{getModeLabel(latestLog.syncMode)}</strong>
              </div>
              <div className="admin-erp-summary-row">
                <span>Estado</span>
                <strong className={`sync-status-badge ${getStatusTone(latestLog.status)}`}>{getStatusLabel(latestLog.status)}</strong>
              </div>
              <div className="admin-erp-summary-row">
                <span>Duración</span>
                <strong>{latestLog.durationMs ? new Intl.NumberFormat("es-PE").format(Math.round(latestLog.durationMs / 1000)) : "N/D"} s</strong>
              </div>
              <div className="admin-erp-summary-row">
                <span>Recibidos</span>
                <strong>{latestLog.fetchedCount}</strong>
              </div>
              <div className="admin-erp-summary-row">
                <span>Creados</span>
                <strong>{latestLog.createdCount}</strong>
              </div>
              <div className="admin-erp-summary-row">
                <span>Actualizados</span>
                <strong>{latestLog.updatedCount}</strong>
              </div>
              <div className="admin-erp-summary-row">
                <span>Omitidos</span>
                <strong>{latestLog.skippedCount}</strong>
              </div>
              <div className="admin-erp-summary-row">
                <span>Errores</span>
                <strong>{latestLog.errorCount}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state admin-erp-empty">
              <Sparkles size={20} />
              <strong>Sin ejecuciones recientes</strong>
              <p>Aún no hay una sincronización activa para mostrar métricas resumidas.</p>
            </div>
          )}

          <div className="admin-erp-failure-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Incidencia</p>
                <h3>Página fallida</h3>
              </div>
            </div>
            {failedLog?.failedPage ? (
              <div className="admin-erp-failure-content">
                <strong>Página {failedLog.failedPage}</strong>
                <p>{failedLog.failedPageMessage ?? failedLog.errorMessage ?? "Sin detalle adicional."}</p>
                <span className={`sync-status-badge ${getStatusTone(failedLog.status)}`}>{getStatusLabel(failedLog.status)}</span>
              </div>
            ) : (
              <div className="empty-state admin-erp-empty">
                <BadgeCheck size={20} />
                <strong>Sin fallos registrados</strong>
                <p>Cuando una página falle, aparecerá aquí con el detalle exacto.</p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="panel sync-history-panel" id="erp-history">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Historial</p>
            <h2>Bitácora visual</h2>
          </div>
          <span className="muted">{syncLogs.length} ejecuciones recientes</span>
        </div>

        {syncLogs.length ? (
          <div className="admin-erp-history-table-wrap">
            <table className="admin-erp-history-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Modo</th>
                  <th>Inicio</th>
                  <th>Duración</th>
                  <th>Recibidos</th>
                  <th>Procesados</th>
                  <th>Creados</th>
                  <th>Actualizados</th>
                  <th>Omitidos</th>
                  <th>Errores</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className={`sync-status-badge ${getStatusTone(log.status)}`}>{getStatusLabel(log.status)}</span>
                    </td>
                    <td>
                      <strong>{getModeLabel(log.syncMode)}</strong>
                      <span className="admin-erp-table-subtitle">{getTriggerLabel(log.trigger)}</span>
                    </td>
                    <td>{dateFormatter.format(new Date(log.startedAt))}</td>
                    <td>
                      <SyncDuration
                        durationMs={log.durationMs}
                        finishedAt={log.finishedAt}
                        startedAt={log.startedAt}
                        status={log.status}
                      />
                    </td>
                    <td>{log.fetchedCount}</td>
                    <td>{log.processedCount}</td>
                    <td>{log.createdCount}</td>
                    <td>{log.updatedCount}</td>
                    <td>{log.skippedCount}</td>
                    <td>{log.errorCount}</td>
                    <td>
                      <div className="admin-erp-table-actions">
                        {log.failedPage ? <span className="admin-erp-failure-chip">Pág. {log.failedPage}</span> : null}
                        {log.status === "RUNNING" ? (
                          <form action={cancelErpSyncAction}>
                            <input name="syncLogId" type="hidden" value={log.id} />
                            <SubmitButton className="sync-cancel-button" pendingLabel="Cancelando...">
                              Cancelar
                            </SubmitButton>
                          </form>
                        ) : (
                          <Link className="button button-ghost button-chip" href="#erp-live">
                            <ArrowRight size={16} />
                            Ver estado
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state admin-erp-empty">
            <Sparkles size={22} />
            <strong>Sin ejecuciones todavía</strong>
            <p>Cuando lances la primera sincronización, aquí verás el historial con estado, duración y conteos.</p>
          </div>
        )}
      </section>

      <section className="admin-erp-mode-footer">
        {recentModes.map((mode) => (
          <article className="admin-erp-mode-foot-card" key={mode.mode}>
            <span>{mode.label}</span>
            <strong>{mode.count}</strong>
            <p>{getModeDescription(mode.mode)}</p>
          </article>
        ))}
      </section>
    </section>
  );
}
