import Link from "next/link";
import { AuditPhoto } from "./audit-photo";
import { prisma } from "@/lib/prisma";
import { auditStatusLabels, type AuditStatus } from "@/lib/catalog-image-audit";
import { readCatalogImageAudit, readCatalogImageAuditProgress } from "@/lib/catalog-image-audit-store";
import styles from "./catalog-image-audit-panel.module.css";
import { MobileDisclosure } from "./mobile-disclosure";

export async function CatalogImageAuditPanel({ params }: { params?: Record<string, string | string[] | undefined> }) {
  const [report, progress] = await Promise.all([readCatalogImageAudit(), readCatalogImageAuditProgress()]);
  const chosen = typeof params?.audit === "string" ? params.audit : "CODE_DIFFERENT";
  const filter = chosen === "ALL" || chosen === "HIDDEN_CODE_DIFFERENT" || chosen in auditStatusLabels ? chosen : "CODE_DIFFERENT";
  const incongruentVisibility = report ? await prisma.product.findMany({
    where: { id: { in: report.rows.filter(row => row.status === "CODE_DIFFERENT").map(row => row.productId) } },
    select: { id: true, isVisible: true },
  }) : [];
  const hiddenIds = new Set(incongruentVisibility.filter(product => !product.isVisible).map(product => product.id));
  const hiddenCount = report?.rows.filter(row => row.status === "CODE_DIFFERENT" && hiddenIds.has(row.productId)).length || 0;
  const query = typeof params?.aq === "string" ? params.aq.trim().slice(0, 120) : "";
  const needle = query.toLocaleLowerCase("es");
  const rows = (report?.rows || []).filter(row => {
    const matchesFilter = filter === "HIDDEN_CODE_DIFFERENT"
      ? row.status === "CODE_DIFFERENT" && hiddenIds.has(row.productId)
      : filter === "CODE_DIFFERENT"
        ? row.status === "CODE_DIFFERENT" && !hiddenIds.has(row.productId)
        : filter === "ALL" || row.status === filter;
    return matchesFilter && (!needle || `${row.code} ${row.name} ${row.printedCodes.join(" ")}`.toLocaleLowerCase("es").includes(needle));
  });
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const requested = Number(params?.ap || 1);
  const page = Math.max(1, Math.min(totalPages, Number.isSafeInteger(requested) ? requested : 1));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const current = await prisma.product.findMany({ where: { id: { in: shown.map(row => row.productId) } }, select: { id: true, code: true, name: true, isVisible: true, imageUrl: true, localImageUrl: true, media: { where: { type: "IMAGE" }, select: { url: true } }, variants: { select: { imageUrl: true } } } });
  const href = (status: string, next = 1) => `/admin/atencion?${new URLSearchParams({ audit: status, aq: query, ap: String(next) })}#codigos-incongruentes`;
  return <section className={`panel ${styles.panel}`} id="codigos-incongruentes" aria-labelledby="audit-heading">
    <div className={styles.heading}>
      <div><p className="eyebrow">Revisión foto por foto</p><h2 id="audit-heading">Códigos incongruentes</h2>
        <p>Compara la etiqueta de la imagen con el código interno y el nombre de la tienda. Una referencia distinta puede pertenecer al mismo producto: revisa la evidencia antes de corregir.</p></div>
      {report ? <div className={styles.downloads}><a className="button button-secondary" href="/api/admin/catalog-image-audit?format=csv">Descargar CSV completo</a><a href="/api/admin/catalog-image-audit?format=json">Datos JSON</a></div> : null}
    </div>
    <div className={styles.progress} role="status">
      {report ? <><strong>{(progress?.completedPhotos ?? report.scannedPhotos).toLocaleString("es-PE")} / {report.totalPhotos.toLocaleString("es-PE")} fotos procesadas</strong><span>{report.totalProducts.toLocaleString("es-PE")} productos · {report.noPhotoProducts.toLocaleString("es-PE")} sin foto</span><span>{report.complete ? "Barrido completo" : "Resultados parciales; el barrido continúa"} · Datos al {new Date(report.generatedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}</span></>
        : <p>{progress ? `Barrido en curso: ${progress.completedPhotos} de ${progress.totalPhotos} fotos. La clasificación estará disponible al publicarse el reporte.` : "Todavía no hay un barrido publicado."}</p>}
    </div>
    {report ? <>
      <nav className={styles.tabs} aria-label="Resultado de revisión de imágenes">
        <Link href={href("CODE_DIFFERENT")} aria-current={filter === "CODE_DIFFERENT" ? "page" : undefined}>Códigos incongruentes <strong>{report.counts.CODE_DIFFERENT - hiddenCount}</strong></Link>
        <Link href={href("HIDDEN_CODE_DIFFERENT")} aria-current={filter === "HIDDEN_CODE_DIFFERENT" ? "page" : undefined}>Incongruentes ocultos <strong>{hiddenCount}</strong></Link>
        {(["CODE_MATCH", "NAME_MATCH", "UNVERIFIABLE", "ERROR", "NO_IMAGE"] as AuditStatus[]).map(status => <Link key={status} href={href(status)} aria-current={filter === status ? "page" : undefined}>{auditStatusLabels[status]} <strong>{report.counts[status]}</strong></Link>)}
        <Link href={href("ALL")} aria-current={filter === "ALL" ? "page" : undefined}>Todas las filas <strong>{report.rows.length}</strong></Link>
      </nav>
      {filter === "HIDDEN_CODE_DIFFERENT" ? <div><h3>Incongruentes ocultos</h3><p>Productos incongruentes actualmente ocultos en el catálogo sincronizado. Se muestran aparte para facilitar tu revisión.</p></div> : null}
      <form action="/admin/atencion#codigos-incongruentes" className={styles.search}>
        <input type="hidden" name="audit" value={filter} /><label>Buscar código o nombre <input type="search" name="aq" defaultValue={query} maxLength={120} /></label><button className="button button-primary" type="submit">Buscar</button>
      </form>
      <p>{rows.length} resultados · Los contadores corresponden a fotos; un producto puede tener varias. “Código congruente” no certifica todos sus detalles visuales.</p>
      <div className={styles.cards}>{shown.map(row => {
        const product = current.find(p => p.id === row.productId);
        const urls = product ? [product.localImageUrl, product.imageUrl, ...product.media.map(m => m.url), ...product.variants.map(v => v.imageUrl)] : [];
        const stale = !product || product.code !== row.code || product.name !== row.name || (row.imageUrl && !urls.includes(row.imageUrl));
        return <article className={styles.card} key={row.id}>
          <div className={styles.photo}>{row.imageUrl ? <a href={row.resolvedImageUrl || row.imageUrl} target="_blank" rel="noreferrer"><AuditPhoto src={row.resolvedImageUrl || row.imageUrl} alt={`Foto auditada del producto ${row.code}`} /><span>Abrir foto completa ↗</span></a> : <span>Sin foto del producto</span>}</div>
          <div className={styles.detail}>
            <span className={row.status === "CODE_DIFFERENT" ? styles.alert : styles.badge}>{auditStatusLabels[row.status]}</span>
            <h3>{row.name}</h3>
            {stale ? <p className={styles.alert}>El producto cambió o se retiró desde el barrido. Este resultado es histórico; requiere una nueva revisión.</p> : null}
            <dl><dt>Código de inventario</dt><dd>{row.code}</dd><dt>Código leído en la imagen</dt><dd>{row.printedCodes.join(" · ") || "Sin lectura confirmada"}</dd></dl>
            <MobileDisclosure title="Ver comparación y evidencia">
            <dl><dt>Comparación del nombre</dt><dd>{row.nameStatus === "MATCH" ? "Coincidencia textual" : row.nameStatus === "PARTIAL" ? "Coincidencia parcial; no confirma identidad" : "Texto insuficiente para comparar"}</dd><dt>Uso de la foto</dt><dd>{row.roles.join(" · ") || "Sin foto"}</dd></dl>
            <p>{row.reason}</p>
            {row.visualReview ? <p>Etiqueta contrastada visualmente por el asistente. Pendiente de tu validación comercial.</p> : <p>Resultado automático. Revisa la imagen antes de realizar cambios.</p>}
            {row.nameEvidence ? <details><summary>Ver texto leído y evidencia</summary><blockquote>{row.nameEvidence}</blockquote><p>Palabras coincidentes: {row.matchingWords.join(", ") || "Ninguna"}</p><ul>{row.codeEvidence.map((read, i) => <li key={i}>{read.code} · lectura {read.view} · confianza OCR {Math.round(read.confidence)} / 100</li>)}</ul><small>Confianza OCR: medida del lector, no garantía de exactitud. Foto registrada el {row.scannedAt}.</small></details> : null}
            </MobileDisclosure>
            <div className={styles.actions}><Link className="button button-primary" href={`/admin/products/${row.productId}#product-cover`}>Revisar producto</Link><span>{(product?.isVisible ?? row.visible) ? "Visible" : "Oculto"} · Stock al barrido: {row.stock}</span></div>
          </div>
        </article>;
      })}</div>
      {!shown.length ? <p>No hay resultados para este filtro. Una imagen sin lectura no se considera incongruente.</p> : null}
      <nav className={styles.pagination} aria-label="Páginas del barrido de imágenes">{page > 1 ? <Link href={href(filter, page - 1)}>Anterior</Link> : <span />}<span>Página {page} de {totalPages}</span>{page < totalPages ? <Link href={href(filter, page + 1)}>Siguiente</Link> : <span />}</nav>
    </> : null}
  </section>;
}
