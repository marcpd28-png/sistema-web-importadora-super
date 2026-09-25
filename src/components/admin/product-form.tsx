"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CatalogProduct, CategoryOption } from "@/lib/store";
import type { ProductActionState } from "@/components/admin/product-form-state";
import { ProductCoverField } from "@/components/admin/product-cover-field";
import { ProductMediaManager } from "@/components/admin/product-media-manager";
import { AdminFormSectionNav } from "@/components/admin/admin-form-section-nav";
import { MobileDisclosure } from "./mobile-disclosure";
import { SubmitButton } from "@/components/ui/submit-button";
import { ErpProductEditor } from "@/components/admin/erp-product-editor";

const PRODUCT_FORM_SECTIONS = [
  { id: "product-identity", label: "Información", description: "Datos que identifican el producto" },
  { id: "product-commerce", label: "Precio e inventario", description: "Venta, unidad y existencias" },
  { id: "product-description", label: "Contenido", description: "Descripción, portada y galería" },
  { id: "product-publishing", label: "Publicación", description: "Revisión y visibilidad" },
] as const;

type ProductFormProps = {
  title: string;
  action: (
    state: ProductActionState,
    formData: FormData,
  ) => ProductActionState | Promise<ProductActionState>;
  categories: CategoryOption[];
  initialState: ProductActionState;
  product?: CatalogProduct;
  status?: string;
};

export function ProductForm({
  title,
  action,
  categories,
  initialState,
  product,
  status,
}: ProductFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const values = state.values;
  const fieldErrors = state.fieldErrors;
  const [liveSummary, setLiveSummary] = useState(() => ({
    name: values.name,
    code: values.code,
    categoryId: values.categoryId,
    isVisible: values.isVisible,
    isFeatured: values.isFeatured,
  }));
  const selectedCategoryName = useMemo(
    () => categories.find((category) => category.id === liveSummary.categoryId)?.name ?? "Sin categoría",
    [categories, liveSummary.categoryId],
  );
  const mediaCount = useMemo(
    () => values.media.filter((item) => item.url.trim()).length,
    [values.media],
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Administración</p>
          <h1>{title}</h1>
        </div>
        <Link href="/admin/atencion">Requiere atención</Link>
      </div>

      {product ? <ErpProductEditor productId={product.id} /> : null}

      <form
        action={formAction}
        className="stack-lg admin-long-form"
        onInput={(event) => {
          const form = event.currentTarget;
          const data = new FormData(form);
          setLiveSummary({
            name: String(data.get("name") ?? ""),
            code: String(data.get("code") ?? ""),
            categoryId: String(data.get("categoryId") ?? ""),
            isVisible: data.get("isVisible") === "on",
            isFeatured: data.get("isFeatured") === "on",
          });
        }}
      >
        {product ? <input type="hidden" name="productId" value={product.id} /> : null}
        {state.message ? (
          <div aria-live="assertive" className="admin-toast admin-toast-error" role="alert">
            <strong>Error</strong>
            <span>{state.message}</span>
          </div>
        ) : null}
        {status ? (
          <div aria-live="polite" className="admin-toast admin-toast-success" role="status">
            <strong>Listo</strong>
            <span>
              {status === "updated"
                ? "El producto se actualizó en la web. Los cambios al ERP se envían desde su panel."
                : "Operación completada correctamente."}
            </span>
          </div>
        ) : null}

        <AdminFormSectionNav label="Secciones del producto" sections={[...PRODUCT_FORM_SECTIONS]} />

        <div className="product-editor-grid">
          <div className="product-editor-main">
            <section className="product-section-card admin-form-anchor" id="product-identity">
              <div className="product-section-head">
                <div>
                  <p className="eyebrow">Identidad</p>
                  <h2>Datos base</h2>
                </div>
              </div>

              <div className="form-grid">
                <label className={cn("field", fieldErrors.code && "field-has-error")}>
                  <span>Código</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.code)}
                    defaultValue={values.code}
                    name="code"
                    required
                  />
                  {fieldErrors.code ? <small className="field-error">{fieldErrors.code}</small> : null}
                </label>

                <label className={cn("field", fieldErrors.name && "field-has-error")}>
                  <span>Nombre</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.name)}
                    defaultValue={values.name}
                    name="name"
                    required
                  />
                  {fieldErrors.name ? <small className="field-error">{fieldErrors.name}</small> : null}
                </label>

                <label className={cn("field", fieldErrors.brand && "field-has-error")}>
                  <span>Marca</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.brand)}
                    defaultValue={values.brand}
                    name="brand"
                  />
                  {fieldErrors.brand ? <small className="field-error">{fieldErrors.brand}</small> : null}
                </label>

                <label className={cn("field", fieldErrors.categoryId && "field-has-error")}>
                  <span>Categoría</span>
                  <select
                    aria-invalid={Boolean(fieldErrors.categoryId)}
                    defaultValue={values.categoryId}
                    name="categoryId"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.categoryId ? (
                    <small className="field-error">{fieldErrors.categoryId}</small>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="product-section-card admin-form-anchor" id="product-commerce">
              <div className="product-section-head">
                <div>
                  <p className="eyebrow">Precio e inventario</p>
                  <h2>Datos de venta</h2>
                </div>
              </div>

              <div className="form-grid">
                <label className={cn("field", fieldErrors.unitLabel && "field-has-error")}>
                  <span>Unidad</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.unitLabel)}
                    defaultValue={values.unitLabel}
                    name="unitLabel"
                    required
                  />
                  {fieldErrors.unitLabel ? <small className="field-error">{fieldErrors.unitLabel}</small> : null}
                </label>

                <label className={cn("field", fieldErrors.stockUnits && "field-has-error")}>
                  <span>Stock</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.stockUnits)}
                    defaultValue={values.stockUnits}
                    min={0}
                    name="stockUnits"
                    required
                    type="number"
                  />
                  {fieldErrors.stockUnits ? <small className="field-error">{fieldErrors.stockUnits}</small> : null}
                </label>

                <label className={cn("field", fieldErrors.unitPrice && "field-has-error")}>
                  <span>Precio unitario</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.unitPrice)}
                    defaultValue={values.unitPrice}
                    min="0.01"
                    name="unitPrice"
                    required
                    step="0.01"
                    type="number"
                  />
                  {fieldErrors.unitPrice ? <small className="field-error">{fieldErrors.unitPrice}</small> : null}
                </label>

              </div>

              <details className="product-advanced-options" open={Boolean(values.wholesalePrice || values.boxPrice)}>
                <summary>Precios por volumen</summary>
                <p className="field-caption">Completa estas opciones solo si el producto se vende al por mayor o por cajón.</p>
                <div className="form-grid product-advanced-options-body">
                  <label className={cn("field", fieldErrors.wholesalePrice && "field-has-error")}>
                    <span>Precio mayorista</span>
                    <input aria-invalid={Boolean(fieldErrors.wholesalePrice)} defaultValue={values.wholesalePrice} min="0.01" name="wholesalePrice" step="0.01" type="number" />
                    {fieldErrors.wholesalePrice ? <small className="field-error">{fieldErrors.wholesalePrice}</small> : null}
                  </label>
                  <label className={cn("field", fieldErrors.wholesaleMinQty && "field-has-error")}>
                    <span>Mínimo mayorista</span>
                    <input aria-invalid={Boolean(fieldErrors.wholesaleMinQty)} defaultValue={values.wholesaleMinQty} min={2} name="wholesaleMinQty" type="number" />
                    {fieldErrors.wholesaleMinQty ? <small className="field-error">{fieldErrors.wholesaleMinQty}</small> : null}
                  </label>
                  <label className={cn("field", fieldErrors.boxPrice && "field-has-error")}>
                    <span>Precio por cajón</span>
                    <input aria-invalid={Boolean(fieldErrors.boxPrice)} defaultValue={values.boxPrice} min="0.01" name="boxPrice" step="0.01" type="number" />
                    {fieldErrors.boxPrice ? <small className="field-error">{fieldErrors.boxPrice}</small> : null}
                  </label>
                  <label className={cn("field", fieldErrors.unitsPerBox && "field-has-error")}>
                    <span>Unidades por cajón</span>
                    <input aria-invalid={Boolean(fieldErrors.unitsPerBox)} defaultValue={values.unitsPerBox} min={1} name="unitsPerBox" type="number" />
                    {fieldErrors.unitsPerBox ? <small className="field-error">{fieldErrors.unitsPerBox}</small> : null}
                  </label>
                </div>
              </details>
            </section>

            <section className="product-section-card admin-form-anchor" id="product-description">
              <div className="product-section-head">
                <div><p className="eyebrow">Contenido</p><h2>Descripción del producto</h2></div>
              </div>
              <div className="form-grid">
                <label className={cn("field field-wide", fieldErrors.description && "field-has-error")}>
                  <span>Descripción</span>
                  <textarea aria-invalid={Boolean(fieldErrors.description)} defaultValue={values.description} name="description" rows={4} />
                  {fieldErrors.description ? <small className="field-error">{fieldErrors.description}</small> : null}
                </label>
                <label className={cn("field field-wide", fieldErrors.technicalSpecs && "field-has-error")}>
                  <span>Especificaciones técnicas</span>
                  <textarea aria-invalid={Boolean(fieldErrors.technicalSpecs)} defaultValue={values.technicalSpecs} name="technicalSpecs" placeholder="Ej.: Pantalla 6.9'', batería 6000 mAh, 33W, Android 15..." rows={4} />
                  {fieldErrors.technicalSpecs ? <small className="field-error">{fieldErrors.technicalSpecs}</small> : null}
                </label>
              </div>
            </section>

            <div className="admin-form-anchor" id="product-cover">
              <ProductCoverField
                key={`${values.code}-${values.imageUrl}`}
                error={fieldErrors.imageUrl}
                value={values.imageUrl}
              />
            </div>

            <div className="admin-form-anchor" id="product-media">
              <ProductMediaManager error={fieldErrors.media} initialItems={values.media} />
            </div>

            <section className="product-section-card admin-form-anchor" id="product-publishing">
              <div className="product-section-head">
                <div>
                  <p className="eyebrow">Estado</p>
                  <h2>Publicación</h2>
                </div>
              </div>

              <div className="checkbox-row">
                <label className="check">
                  <input defaultChecked={values.isVisible} name="isVisible" type="checkbox" />
                  <span>Visible</span>
                </label>

                <label className="check">
                  <input defaultChecked={values.isFeatured} name="isFeatured" type="checkbox" />
                  <span>Destacado</span>
                </label>
              </div>
              <p className="admin-form-save-hint">Solo se muestra en la web cuando tiene una foto real en la portada o galería, incluso después de sincronizar. Al guardar, la portada también se conserva en la galería.</p>
            </section>
          </div>

          <aside className="product-editor-sidebar">
            <MobileDisclosure title="Resumen del producto">
            <article className="product-summary-card">
              <p className="eyebrow">Resumen</p>
              <strong>{liveSummary.name || "Nuevo producto"}</strong>
              <span>{liveSummary.code || "Código pendiente"}</span>
              <span>{selectedCategoryName}</span>
            </article>

            <article className="product-summary-card">
              <p className="eyebrow">Estado actual</p>
              <span>{liveSummary.isVisible ? "Publicación habilitada · requiere foto" : "Borrador / oculto"}</span>
              <span>{liveSummary.isFeatured ? "Destacado" : "Normal"}</span>
              <span>{values.imageUrl.trim() ? "Portada cargada" : "Sin portada"}</span>
              <span>{values.technicalSpecs.trim() ? "Con especificaciones" : "Sin especificaciones"}</span>
              <span>{mediaCount} medios</span>
            </article>
            </MobileDisclosure>
          </aside>
        </div>

        <div className="actions-row product-editor-actions admin-form-sticky-actions">
          <span className="admin-form-save-hint">Los productos nuevos se guardan ocultos hasta que decidas publicarlos.</span>
          <SubmitButton pendingLabel={product ? "Guardando cambios..." : "Creando producto..."}>
            {product ? "Guardar cambios solo en la web" : "Crear producto"}
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
