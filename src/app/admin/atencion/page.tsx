import Link from "next/link";
import { Camera, CheckCircle2, Package, Search, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { buildProductsNeedingPhotoWhere } from "@/lib/product-photo-policy";
import { buildProductSearchWhere } from "@/lib/store-shared";
import styles from "./page.module.css";
import { CatalogImageAuditPanel } from "@/components/admin/catalog-image-audit-panel";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export default async function AttentionPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params?.q === "string" ? params.q.trim().slice(0, 120) : "";
  const requestedPage = Number(params?.page ?? 1);
  const attentionWhere = buildProductsNeedingPhotoWhere();
  const searchWhere = buildProductSearchWhere(query);
  const where = { AND: [attentionWhere, ...(searchWhere ? [searchWhere] : [])] };
  const [summary, totalResults] = await Promise.all([
    prisma.product.aggregate({ where: attentionWhere, _count: true, _sum: { stockUnits: true } }),
    prisma.product.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const page = Math.min(totalPages, Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1);
  const products = await prisma.product.findMany({
    where,
    select: { id: true, code: true, name: true, category: true, stockUnits: true, isVisible: true, lastSyncedAt: true },
    orderBy: [{ stockUnits: "desc" }, { name: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const pageHref = (next: number) => `/admin/atencion?${new URLSearchParams({ q: query, page: String(next) })}`;
  const number = new Intl.NumberFormat("es-PE");

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Catálogo e inventario</p>
          <h1>Requiere atención</h1>
          <p>Revisa la identidad de las imágenes y completa las fotos pendientes de tus productos.</p>
        </div>
        <Link className="button button-secondary" href="/admin/products">Ver todos los productos</Link>
      </header>

      <CatalogImageAuditPanel params={params} />

      <section className={styles.rule} aria-label="Regla de publicación">
        <ShieldCheck size={24} aria-hidden="true" />
        <div>
          <strong>Sin foto, no se publica</strong>
          <p>La protección se aplica también después de cada sincronización. Una imagen genérica o un video no cuentan como foto del producto.</p>
        </div>
      </section>

      <div className={styles.metrics}>
        <article className={styles.metric}>
          <Camera size={21} aria-hidden="true" />
          <span>Productos con stock sin foto</span>
          <strong>{number.format(summary._count)}</strong>
        </article>
        <article className={styles.metric}>
          <Package size={21} aria-hidden="true" />
          <span>Unidades pendientes de foto</span>
          <strong>{number.format(summary._sum.stockUnits ?? 0)}</strong>
        </article>
      </div>

      <section className={`panel ${styles.list}`}>
        <div className={styles.listHeading}>
          <div>
            <h2>Stock disponible, foto pendiente</h2>
            <p>Ordenados por mayor stock. Incluye los productos ocultos manualmente.</p>
          </div>
          <form action="/admin/atencion" className={styles.search}>
            <label className={styles.searchField}>
              <Search size={18} aria-hidden="true" />
              <span className={styles.srOnly}>Buscar por código, nombre, marca o categoría</span>
              <input defaultValue={query} name="q" placeholder="Código, nombre, marca..." type="search" maxLength={120} />
            </label>
            <button className="button button-primary" type="submit">Buscar</button>
            {query ? <Link href="/admin/atencion">Limpiar</Link> : null}
          </form>
        </div>

        {products.length ? (
          <>
            <p className={styles.resultCount}>{number.format(totalResults)} productos{query ? " encontrados" : " pendientes"}</p>
            <ul className={styles.products}>
              {products.map((product) => (
                <li className={styles.product} key={product.id}>
                  <div className={styles.photo} aria-hidden="true"><Camera size={24} /></div>
                  <div className={styles.identity}>
                    <span className={styles.code}>{product.code}</span>
                    <h3>{product.name}</h3>
                    <p>{product.category || "Sin categoría"}</p>
                    <small>{product.lastSyncedAt
                      ? `Última sincronización: ${product.lastSyncedAt.toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}`
                      : "Aún no se ha sincronizado"}</small>
                  </div>
                  <div className={styles.status}>
                    <strong>{number.format(product.stockUnits)} unidades</strong>
                    <span>Oculto en la web · sin foto</span>
                    {!product.isVisible ? <small>Publicación desactivada</small> : null}
                  </div>
                  <Link className={`button button-primary ${styles.edit}`} href={`/admin/products/${product.id}#product-cover`}>
                    <Camera size={16} aria-hidden="true" /> Agregar foto
                    <span className={styles.srOnly}> a {product.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <nav className={styles.pagination} aria-label="Páginas de productos pendientes">
              {page > 1 ? <Link className="button button-secondary" href={pageHref(page - 1)}>Anterior</Link> : <span />}
              <span>Página {page} de {totalPages}</span>
              {page < totalPages ? <Link className="button button-secondary" href={pageHref(page + 1)}>Siguiente</Link> : <span />}
            </nav>
          </>
        ) : (
          <div className={styles.empty}>
            <CheckCircle2 size={38} aria-hidden="true" />
            <h3>{query ? "No hay coincidencias" : "No tienes productos con stock pendientes de foto"}</h3>
            <p>{query ? "Prueba otro nombre o código, o limpia la búsqueda." : "Los productos nuevos que necesiten foto aparecerán aquí automáticamente."}</p>
          </div>
        )}
      </section>
      <p className={styles.help}>Al guardar una foto válida en la portada o galería, el producto sale de esta lista. Para que se muestre en la web, también debe tener activada la opción de publicación «Visible».</p>
    </div>
  );
}
