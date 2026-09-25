import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStoreAnalyticsReport } from "@/lib/store-analytics-report";
import styles from "./analytics.module.css";
export const dynamic = "force-dynamic";
const number = (value: bigint | number) => Number(value).toLocaleString("es-PE");
const labels: Record<string, string> = { direct: "Directo / sin referencia", google: "Google", tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp", other: "Otras fuentes", mobile: "Móvil", desktop: "Pantalla grande" };
function Bars({ rows }: { rows: Array<{ label: string; total: bigint }> }) {
  const max = Math.max(1, ...rows.map(row => Number(row.total)));
  return rows.length ? <div className={styles.bars}>{rows.map(row => <div key={row.label}><div className={styles.barLabel}><span>{labels[row.label] || row.label}</span><strong>{number(row.total)}</strong></div><div className={styles.track}><div style={{ width: `${Number(row.total) / max * 100}%` }} /></div></div>)}</div> : <p className={styles.empty}>Todavía no hay visitas registradas en este período.</p>;
}
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const days = [1, 7, 30].includes(Number(params.days)) ? Number(params.days) : 7;
  const report = await getStoreAnalyticsReport(days).catch(() => null);
  const session = report?.session;
  const steps = session ? [{ label: "Sesiones con visitas", total: session.visits }, { label: "Con productos añadidos", total: session.carts }, { label: "Con formulario abierto", total: session.starts }, { label: "Con cotización confirmada", total: session.quotes }] : [];
  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>COMPORTAMIENTO DEL CLIENTE</p><h1>Visitas y mapas de calor</h1><p>Descubre qué buscan, qué les interesa y dónde necesitan ayuda.</p></div><nav aria-label="Período" className={styles.filters}>{[1, 7, 30].map(value => <Link aria-current={days === value ? "page" : undefined} key={value} href={`/admin/analitica?days=${value}`}>{value === 1 ? "24 horas" : `${value} días`}</Link>)}</nav></header>
    {!report ? <section className={styles.card} role="status"><h2>Medición temporalmente no disponible</h2><p>No se pudieron consultar los datos. Actualiza esta página dentro de unos minutos.</p></section> : <>
      <p className={styles.note}>Período móvil hasta {report.end.toLocaleString("es-PE", { timeZone: "America/Lima" })} · Hora de Lima · Solo navegación con consentimiento. Las sesiones no equivalen a personas únicas.</p>
      {!Number(session!.visits) && <div className={styles.notice}><strong>Esperando las primeras visitas</strong><p>La nueva medición empieza con las visitas que acepten analítica. No reconstruye el historial anterior.</p></div>}
      <div className={styles.metrics}>{[
        ["Sesiones registradas", session!.visits, "Se renuevan tras 30 minutos de inactividad"],
        ["Cotizaciones confirmadas", report.events.quote_created || 0, "Registro comprobado en el ERP"],
        ["Carritos sin cotización", session!.abandoned, "Sesiones inactivas al menos 30 minutos"],
        ["Clics en WhatsApp", report.events.whatsapp_click || 0, "Intención de contacto; no confirma una venta"],
      ].map(([label, value, hint]) => <article className={styles.card} key={String(label)}><p>{String(label)}</p><strong className={styles.value}>{number(value as number | bigint)}</strong><small>{String(hint)}</small></article>)}</div>
      <div className={styles.grid}><section className={styles.card}><h2>Del catálogo a la cotización</h2><p>Sesiones con cada acción durante el período. Son conteos independientes, no una conversión secuencial.</p><Bars rows={steps}/></section>
      <section className={styles.card}><h2>Qué conviene revisar</h2><ul className={styles.insights}>
        {report.searches.some(row => Number(row.empty)) && <li><strong>Búsquedas sin resultados.</strong> Revisa los términos de abajo para mejorar nombres, sinónimos o disponibilidad.</li>}
        {Number(session!.abandoned) > 0 && <li><strong>{number(session!.abandoned)} carritos sin cotización observada.</strong> Revisa precios, stock y facilidad del formulario. Un cierre fuera de la web puede no quedar registrado.</li>}
        {(report.events.checkout_error || 0) > 0 && <li><strong>{number(report.events.checkout_error)} errores al enviar cotizaciones.</strong> Revisa los registros del ERP y prueba el formulario.</li>}
        <li><strong>Comprueba el recorrido.</strong> Usa grabaciones y mapas de calor para entender las dificultades detrás de estas cifras.</li>
      </ul><a className={styles.button} href="https://clarity.microsoft.com/" target="_blank" rel="noopener noreferrer">Abrir mapas y grabaciones ↗</a><small>Los mapas se consultan en Microsoft Clarity con la cuenta del proyecto.</small></section></div>
      <div className={styles.grid}><section className={styles.card}><h2>Productos que despiertan interés</h2><div className={styles.table}><table><thead><tr><th>Producto</th><th>Vistas</th><th>Añadidos</th></tr></thead><tbody>{report.products.map(row => <tr key={row.code}><td>{row.name}<small>{row.code}</small></td><td>{number(row.views)}</td><td>{number(row.carts)}</td></tr>)}</tbody></table></div>{!report.products.length && <p className={styles.empty}>Aparecerán al consultar productos o añadirlos al carrito.</p>}<small>Acciones registradas, no unidades vendidas.</small></section>
      <section className={styles.card}><h2>Qué buscan los clientes</h2><div className={styles.table}><table><thead><tr><th>Búsqueda</th><th>Consultas</th><th>Sin resultados</th></tr></thead><tbody>{report.searches.map(row => <tr key={row.term}><td>{row.term}</td><td>{number(row.total)}</td><td>{number(row.empty)}</td></tr>)}</tbody></table></div>{!report.searches.length && <p className={styles.empty}>Todavía no hay búsquedas con resultados medidos.</p>}<small>No incluye redirecciones directas a productos ni términos filtrados por privacidad.</small></section></div>
      <div className={styles.grid}><section className={styles.card}><h2>Origen de las visitas</h2><Bars rows={report.sources}/></section><section className={styles.card}><h2>Dispositivos</h2><Bars rows={report.devices}/><small>Según el ancho de pantalla; una sesión puede usar ambos tamaños.</small></section></div>
      <div className={styles.grid}><section className={styles.card}><h2>Interacciones con Rocky</h2><div className={styles.barLabel}><span>Aperturas</span><strong>{number(report.events.assistant_open || 0)}</strong></div><div className={styles.barLabel}><span>Mensajes enviados</span><strong>{number(report.events.assistant_message || 0)}</strong></div><small>Solo acciones en la tienda con consentimiento. Esta medición no guarda textos de conversaciones.</small></section><section className={styles.card}><h2>Pedidos marcados como pagados</h2><strong className={styles.value}>{number(report.orders)}</strong><p>Pedidos creados en el período, con estado actual «pagado».</p><small>Datos del sistema: excluye pedidos de prueba y cobros simulados. No se atribuyen a estas visitas ni se cuentan como conversión web.</small></section></div>
    </>}
  </div>;
}
