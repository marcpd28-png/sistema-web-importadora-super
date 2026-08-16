import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  ExternalLink,
  Filter,
  FolderPlus,
  FolderTree,
  PackageSearch,
  Search,
  Trash2,
} from "lucide-react";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAdminCategories } from "@/lib/store";

type CategoriesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const categories = await getAdminCategories();
  const params = searchParams ? await searchParams : undefined;
  const status = typeof params?.status === "string" ? params.status : "";
  const error = typeof params?.error === "string" ? params.error : "";
  const query = typeof params?.q === "string" ? params.q.trim() : "";
  const filter = typeof params?.filter === "string" ? params.filter : "all";
  
  const normalizedQuery = query.toLowerCase();
  
  const filteredCategories = categories.filter((category) => {
    const matchesQuery = !normalizedQuery || (
      category.name.toLowerCase().includes(normalizedQuery) ||
      category.slug.toLowerCase().includes(normalizedQuery)
    );

    if (!matchesQuery) return false;

    if (filter === "active") return category.productCount > 0;
    if (filter === "empty") return category.productCount === 0;

    return true;
  });

  const activeCategories = categories.filter((category) => category.productCount > 0).length;
  const emptyCategories = categories.length - activeCategories;

  return (
    <section className="panel admin-categories-workspace">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Categorías del Catálogo</p>
          <h1>Gestión y Estructura Comercial</h1>
        </div>
      </div>

      {status ? (
        <div className="admin-toast admin-toast-success">
          <strong>Listo</strong>
          <span>Operación completada: {status}</span>
        </div>
      ) : null}
      {error ? (
        <div className="admin-toast admin-toast-error">
          <strong>Error</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {/* KPI Cards Row */}
      <div className="category-summary-grid">
        <article className="category-summary-card">
          <span className="category-summary-icon">
            <FolderTree size={20} />
          </span>
          <div>
            <strong>{categories.length}</strong>
            <span>Total categorías</span>
          </div>
        </article>

        <article className="category-summary-card is-active-kpi">
          <span className="category-summary-icon">
            <Boxes size={20} />
          </span>
          <div>
            <strong>{activeCategories}</strong>
            <span>Con productos activos</span>
          </div>
        </article>

        <article className="category-summary-card is-empty-kpi">
          <span className="category-summary-icon">
            <Trash2 size={20} />
          </span>
          <div>
            <strong>{emptyCategories}</strong>
            <span>Sin productos (Vacías)</span>
          </div>
        </article>
      </div>

      {/* Search & Filter Bar */}
      <article className="category-toolbar-card">
        <form className="category-search-form" method="get">
          <label className="category-search-field">
            <Search size={18} />
            <input
              defaultValue={query}
              name="q"
              placeholder="Buscar categoría por nombre o slug..."
              type="search"
            />
          </label>

          <select defaultValue={filter} name="filter" className="category-filter-select">
            <option value="all">Todas las categorías ({categories.length})</option>
            <option value="active">Solo con productos ({activeCategories})</option>
            <option value="empty">Solo vacías ({emptyCategories})</option>
          </select>

          <button className="button button-primary" type="submit">
            <Filter size={16} />
            Filtrar
          </button>

          {query || filter !== "all" ? (
            <Link className="button button-secondary" href="/admin/categories">
              Limpiar
            </Link>
          ) : null}
        </form>
      </article>

      {/* 2-Column Main Workspace */}
      <div className="admin-categories-grid">
        {/* Left Column: Create New Category */}
        <aside className="admin-categories-sidebar">
          <article className="category-create-card">
            <div className="stack-sm">
              <div className="category-icon">
                <FolderPlus size={20} />
              </div>
              <h2>Crear Categoría</h2>
              <p className="muted text-sm">
                Agrega una nueva categoría al catálogo. El slug amigable se generará automáticamente.
              </p>
            </div>

            <form action={createCategoryAction} className="stack-md margin-top-sm">
              <label className="field">
                <span>Nombre de la categoría</span>
                <input name="name" placeholder="Ej. Accesorios para Celular" required />
              </label>

              <SubmitButton pendingLabel="Creando...">
                Crear categoría
              </SubmitButton>
            </form>
          </article>
        </aside>

        {/* Right Column: Category List Cards/Table */}
        <main className="admin-categories-main">
          {filteredCategories.length ? (
            <div className="category-card-grid">
              {filteredCategories.map((category) => (
                <article className="category-card" key={category.id}>
                  <div className="category-card-top">
                    <div className="category-card-header-info">
                      <div className="category-card-badge">
                        <FolderTree size={18} />
                      </div>
                      <div>
                        <code className="category-slug-tag">/{category.slug}</code>
                      </div>
                    </div>
                    <span className={`status-badge ${category.productCount > 0 ? "is-visible" : "is-hidden"}`}>
                      {category.productCount} producto{category.productCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <form action={updateCategoryAction} className="category-card-form">
                    <input name="categoryId" type="hidden" value={category.id} />
                    <label className="field">
                      <span>Nombre comercial</span>
                      <input defaultValue={category.name} name="name" required />
                    </label>
                    <div className="category-card-actions-row">
                      <SubmitButton pendingLabel="Guardando...">Guardar</SubmitButton>
                      
                      <Link
                        className="button button-secondary button-chip"
                        href={`/admin/products?category=${encodeURIComponent(category.slug)}`}
                        title="Ver productos en el panel de admin"
                      >
                        <PackageSearch size={14} />
                        Productos ({category.productCount})
                      </Link>

                      <a
                        className="button button-ghost button-chip"
                        href={`/categoria/${encodeURIComponent(category.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Ver en la tienda pública"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </form>

                  <div className="category-card-footer">
                    <form action={deleteCategoryAction}>
                      <input name="categoryId" type="hidden" value={category.id} />
                      <button
                        className="icon-button danger category-delete-button"
                        type="submit"
                        title={
                          category.productCount > 0
                            ? `Esta categoría tiene ${category.productCount} productos vinculados`
                            : "Eliminar categoría"
                        }
                      >
                        <Trash2 size={16} />
                        <span className="text-xs">Eliminar</span>
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <article className="panel panel-slim empty-state">
              <p className="muted">
                {categories.length ? "No se encontraron categorías con los filtros aplicados." : "Aún no hay categorías registradas."}
              </p>
              {query || filter !== "all" ? (
                <Link className="button button-secondary" href="/admin/categories">
                  Limpiar filtros
                </Link>
              ) : null}
            </article>
          )}
        </main>
      </div>
    </section>
  );
}

