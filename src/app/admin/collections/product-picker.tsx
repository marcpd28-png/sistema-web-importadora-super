"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { searchCampaignProducts } from "./actions";
import styles from "./collections.module.css";

type Results = Awaited<ReturnType<typeof searchCampaignProducts>>;

export function ProductPicker({ codes, onChange, id }: {
  codes: string;
  onChange: (codes: string) => void;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = new Set(codes.split(/[\n,;]+/).map(code => code.trim()).filter(Boolean));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await searchCampaignProducts(query, page);
        if (!cancelled) setResult(next);
      } catch {
        if (!cancelled) setError("No se pudieron cargar los productos. Intenta nuevamente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query, page, retry]);

  function refresh() {
    setLoading(true);
    setError("");
  }

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else if (next.size < 500) next.add(code);
    onChange([...next].join("\n"));
  }

  return <div className={styles.productPicker}>
    <button type="button" className={styles.searchButton} aria-expanded={open} aria-controls={id}
      onClick={() => { if (!open) refresh(); setOpen(!open); }}>
      {open ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
      {open ? "Cerrar buscador" : "Buscar y seleccionar productos"}
    </button>
    {open && <section id={id} className={styles.pickerPanel} aria-label="Seleccionar productos del catálogo">
      <label className={styles.searchInput}>
        <Search size={18} aria-hidden="true" />
        <input autoFocus type="search" aria-label="Buscar por nombre o código" placeholder="Buscar por nombre o código…"
          maxLength={120} value={query} onChange={event => { refresh(); setQuery(event.target.value); setPage(0); }}
          onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
      </label>
      <p className={styles.hint} role="status">{selected.size} / 500 seleccionados. Marca o desmarca para actualizar la lista.</p>
      {selected.size >= 500 && <p className={styles.hint}>Alcanzaste el límite. Quita un producto para agregar otro.</p>}
      {loading ? <p role="status" className={styles.hint}>Buscando productos…</p> : error ?
        <div role="alert"><p>{error}</p><button type="button" className={styles.searchButton} onClick={() => { refresh(); setRetry(retry + 1); }}>Reintentar</button></div> : <>
          <div className={styles.productResults}>
            {result?.products.map(product => <label key={product.code} className={styles.productOption}>
              <input type="checkbox" checked={selected.has(product.code)} disabled={!selected.has(product.code) && selected.size >= 500}
                onChange={() => toggle(product.code)} />
              <span><strong>{product.name}</strong><small>{product.code} · Stock: {product.stockUnits}{!product.isVisible ? " · Oculto en tienda" : ""}</small></span>
            </label>)}
            {!result?.products.length && <p className={styles.hint}>No se encontraron productos. Prueba con otro nombre o código.</p>}
          </div>
          <div className={styles.pickerPagination}>
            <button type="button" className={styles.searchButton} disabled={page === 0} onClick={() => { refresh(); setPage(page - 1); }}>Anterior</button>
            <span className={styles.hint}>Página {page + 1}</span>
            <button type="button" className={styles.searchButton} disabled={!result?.hasMore} onClick={() => { refresh(); setPage(page + 1); }}>Siguiente</button>
          </div>
        </>}
    </section>}
  </div>;
}
