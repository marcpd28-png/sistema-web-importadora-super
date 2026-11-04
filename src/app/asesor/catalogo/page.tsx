/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PackageSearch } from "lucide-react";
import { requireAdvisor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSellableProductWhere } from "@/lib/store-shared";
import { formatCurrency } from "@/lib/utils";
import styles from "./advisor-catalog.module.css";

type AdvisorCatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const pageSize = 24;

function pageHref(input: { q: string; category: string; page: number }) {
  const params = new URLSearchParams({ page: String(input.page) });
  if (input.q) params.set("q", input.q);
  if (input.category !== "all") params.set("category", input.category);
  return `/asesor/catalogo?${params.toString()}`;
}

export const dynamic = "force-dynamic";

export default async function AdvisorCatalogPage({ searchParams }: AdvisorCatalogPageProps) {
  await requireAdvisor();
  const params = searchParams ? await searchParams : undefined;
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 120) : "";
  const category = typeof params?.category === "string" ? params.category : "all";
  const rawPage = Number(typeof params?.page === "string" ? params.page : "1");
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const conditions: Prisma.ProductWhereInput[] = [buildSellableProductWhere()];

  if (category !== "all") {
    conditions.push({ categoryRef: { is: { slug: category } } });
  }

  if (q) {
    conditions.push({
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const where: Prisma.ProductWhereInput = { AND: conditions };

  const [total, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.category.findMany({
      where: { products: { some: { AND: [buildSellableProductWhere()] } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const products = await prisma.product.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      code: true,
      slug: true,
      name: true,
      brand: true,
      imageUrl: true,
      localImageUrl: true,
      unitPrice: true,
      wholesalePrice: true,
      wholesaleMinQty: true,
      stockUnits: true,
      media: { where: { type: "IMAGE" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
    },
  });

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className="eyebrow">Consulta comercial</p>
          <h1>Catálogo disponible</h1>
          <p className={styles.heroCopy}>Consulta productos, precios y disponibilidad. Este espacio es solo de lectura: no permite editar inventario ni publicaciones.</p>
        </div>
        <div className={styles.stat}><strong>{total}</strong><span>productos publicados</span></div>
      </header>

      <form className={styles.filters} method="GET">
        <label className={styles.field}><span>Buscar producto, código o marca</span><input defaultValue={q} name="q" placeholder="Ej. parlante, JBL, código" type="search" /></label>
        <label className={styles.field}><span>Categoría</span><select defaultValue={category} name="category"><option value="all">Todas las categorías</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
        <button className={`button button-primary ${styles.filterAction}`} type="submit">Buscar</button>
      </form>

      <div className={styles.results}><span><strong>{total}</strong> resultado{total === 1 ? "" : "s"}{q ? ` para “${q}”` : ""}</span><span>Página {page} de {totalPages}</span></div>

      {products.length ? <div className={styles.grid}>{products.map((product) => {
        const imageUrl = product.localImageUrl || product.media[0]?.url || product.imageUrl;
        return <article className={styles.card} key={product.id}>
          <div className={styles.media}>
            {imageUrl ? <img alt={product.name} src={imageUrl} /> : <span className={styles.placeholder}>Sin imagen</span>}
            <span className={styles.stock} data-empty={product.stockUnits <= 0}>{product.stockUnits > 0 ? `${product.stockUnits} disponibles` : "Sin stock"}</span>
          </div>
          <div className={styles.body}>
            <div className={styles.meta}><span className={styles.code}>{product.code}</span><span>{product.brand || "Sin marca"}</span></div>
            <h2 className={styles.name}>{product.name}</h2>
            <div className={styles.priceRow}>
              <div className={styles.price}><span>Precio unitario</span><strong>{formatCurrency(Number(product.unitPrice), "S/")}</strong></div>
              {product.wholesalePrice ? <span className={styles.wholesale}>Mayorista: {formatCurrency(Number(product.wholesalePrice), "S/")} desde {product.wholesaleMinQty} uds.</span> : null}
            </div>
            <Link className={styles.detail} href={`/producto/${product.slug}`} rel="noreferrer" target="_blank">Ver ficha pública</Link>
          </div>
        </article>;
      })}</div> : <section className={styles.empty}><PackageSearch size={28} /><h2>No encontramos productos</h2><p>Prueba con otro nombre, código o categoría.</p><Link className="button button-secondary" href="/asesor/catalogo">Limpiar búsqueda</Link></section>}

      <nav aria-label="Paginación del catálogo" className={styles.pager}>
        {page > 1 ? <Link className="button button-secondary" href={pageHref({ q, category, page: page - 1 })}>Página anterior</Link> : <span />}
        {page < totalPages ? <Link className="button button-secondary" href={pageHref({ q, category, page: page + 1 })}>Página siguiente</Link> : null}
      </nav>
    </section>
  );
}
