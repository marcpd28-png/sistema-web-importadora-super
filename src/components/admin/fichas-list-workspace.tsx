"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import {
  Search,
  QrCode,
  Edit,
  ExternalLink,
  Printer,
  Copy,
  Check,
  Eye,
  FileSpreadsheet,
  AlertCircle
} from "lucide-react";

type ProductWithFichaStats = {
  id: string;
  name: string;
  code: string;
  unitPrice: any;
  slug: string;
  digitalProfile: {
    status: string;
    descriptionShort: string | null;
  } | null;
  qr: {
    destUrl: string;
    imageUrl: string | null;
  } | null;
  _count: {
    specifications: number;
    variants: number;
    videos: number;
    documents: number;
  };
  stats: {
    scans: number;
    last7Days: number;
    videoPlays: number;
    cartAdds: number;
    whatsappClicks: number;
  };
};

type FichasListWorkspaceProps = {
  products: ProductWithFichaStats[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    q: string;
    profileStatus: string;
  };
};

export function FichasListWorkspace({
  products,
  total,
  page,
  pageSize,
  filters,
}: FichasListWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeQrProduct, setActiveQrProduct] = useState<ProductWithFichaStats | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const totalPages = Math.ceil(total / pageSize);

  function updateFilters(newFilters: Partial<typeof filters>) {
    const searchParams = new URLSearchParams(window.location.search);
    Object.entries({ ...filters, ...newFilters }).forEach(([key, val]) => {
      if (val && val !== "all") {
        searchParams.set(key, val);
      } else {
        searchParams.delete(key);
      }
    });
    searchParams.delete("page"); // reset page on filter change
    router.push(`${pathname}?${searchParams.toString()}`);
  }

  function handlePageChange(newPage: number) {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("page", String(newPage));
    router.push(`${pathname}?${searchParams.toString()}`);
  }

  function toggleSelectAll() {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function handleGenerateQr(product: ProductWithFichaStats) {
    setGeneratingId(product.id);
    try {
      const formData = new FormData();
      formData.append("productId", product.id);

      const response = await fetch("/api/admin/fichas/generate-qr", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Error al generar QR");
      }

      router.refresh();
      // Show success or update active QR state if open
      const updated = await response.json();
      if (activeQrProduct?.id === product.id) {
        setActiveQrProduct({ ...product, qr: updated.qr });
      }
    } catch (error) {
      console.error(error);
      alert("Hubo un error al generar el código QR.");
    } finally {
      setGeneratingId(null);
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handlePrintSelected() {
    if (selectedIds.length === 0) return;
    window.open(`/admin/fichas/print?ids=${selectedIds.join(",")}`, "_blank");
  }

  // Calc summary stats for the current list view page
  const totalScans = products.reduce((acc, p) => acc + p.stats.scans, 0);
  const totalPlays = products.reduce((acc, p) => acc + p.stats.videoPlays, 0);
  const totalPublished = products.filter((p) => p.digitalProfile?.status === "PUBLICADA").length;

  return (
    <div className="admin-workspace stack-lg">
      {/* Header */}
      <header
        style={{
          background: "linear-gradient(135deg, #f0f4ff 0%, #e0f2fe 100%)",
          padding: "24px 32px",
          borderRadius: "16px",
          border: "1px solid #c7d2fe",
          boxShadow: "0 10px 20px -5px rgba(99, 102, 241, 0.05)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "24px",
          marginBottom: "8px",
          width: "100%"
        }}
      >
        <style>{`
          @keyframes pulse-dot {
            0% { transform: scale(0.9); opacity: 0.6; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.6; }
          }
          @keyframes scan-line {
            0% { top: 0%; }
            50% { top: 100%; }
            100% { top: 0%; }
          }
        `}</style>

        <div style={{ flex: "1 1 500px" }} className="stack-xs">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(79, 70, 229, 0.08)",
              border: "1px solid rgba(79, 70, 229, 0.15)",
              padding: "4px 12px",
              borderRadius: "100px",
              color: "#4f46e5",
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
              alignSelf: "flex-start"
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#4f46e5",
                display: "inline-block",
                animation: "pulse-dot 2s infinite ease-in-out"
              }}
            ></span>
            Módulo Comercial
          </div>

          <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", margin: 0, lineHeight: "1.2", border: "none", padding: 0 }}>
            Fichas Digitales y <span style={{ background: "linear-gradient(to right, #4f46e5, #0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Códigos QR</span>
          </h1>

          <p style={{ fontSize: "14px", color: "#475569", margin: "8px 0 0", maxWidth: "620px", lineHeight: "1.6" }}>
            Digitaliza la experiencia de compra en tu tienda física. Vincula cada producto a una ficha técnica interactiva con fotos, especificaciones, videos y manuales descargables escaneando un código QR en góndola.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {selectedIds.length > 0 && (
            <button
              onClick={handlePrintSelected}
              className="button button-primary"
              style={{ display: "flex", alignItems: "center", gap: "8px", height: "46px", padding: "0 20px" }}
            >
              <Printer size={18} />
              Imprimir Tarjetas ({selectedIds.length})
            </button>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "74px",
              height: "74px",
              background: "white",
              borderRadius: "16px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 8px 16px -4px rgba(0,0,0,0.05)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                width: "100%",
                height: "2px",
                background: "linear-gradient(to right, transparent, #4f46e5, transparent)",
                animation: "scan-line 3s infinite ease-in-out"
              }}
            ></div>
            <QrCode size={40} style={{ color: "#4f46e5" }} />
          </div>
        </div>
      </header>

      {/* Metrics Banner */}
      <section className="admin-dashboard-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <div className="metric-card panel">
          <p className="metric-label">Fichas Publicadas</p>
          <h2 className="metric-value">{totalPublished} <span style={{ fontSize: "14px", fontWeight: "normal", color: "#64748b" }}>de {products.length} cargados</span></h2>
        </div>
        <div className="metric-card panel">
          <p className="metric-label">Escaneos Totales</p>
          <h2 className="metric-value">{totalScans}</h2>
        </div>
        <div className="metric-card panel">
          <p className="metric-label">Videos Reproducidos</p>
          <h2 className="metric-value">{totalPlays}</h2>
        </div>
      </section>

      {/* Search and Filters */}
      <div className="admin-filters-bar panel" style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "12px", flex: 1, minWidth: "280px" }}>
          <div className="search-input-wrapper" style={{ position: "relative", flex: 1 }}>
            <Search size={18} className="search-icon" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
            <input
              type="search"
              placeholder="Buscar por nombre o SKU..."
              defaultValue={filters.q}
              onChange={(e) => updateFilters({ q: e.target.value })}
              style={{ width: "100%", padding: "10px 12px 10px 38px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <select
            value={filters.profileStatus}
            onChange={(e) => updateFilters({ profileStatus: e.target.value })}
            style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "white" }}
          >
            <option value="all">Todos los estados</option>
            <option value="published">Publicadas</option>
            <option value="draft">Borrador</option>
            <option value="missing">Sin ficha</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="panel overflow-x" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "40px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={products.length > 0 && selectedIds.length === products.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Producto</th>
              <th>Estado Ficha</th>
              <th>QR Code</th>
              <th style={{ textAlign: "center" }}>Características</th>
              <th style={{ textAlign: "center" }}>Escaneos (7d)</th>
              <th style={{ textAlign: "center" }}>Clicks WA</th>
              <th style={{ width: "140px", textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  <AlertCircle size={24} style={{ margin: "0 auto 8px", color: "#94a3b8" }} />
                  No se encontraron productos con los filtros aplicados.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const status = p.digitalProfile?.status || "SIN_FICHA";
                const isPublished = status === "PUBLICADA";
                const isDraft = status === "BORRADOR";

                return (
                  <tr key={p.id}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td>
                      <div className="stack-xxs">
                        <span style={{ fontWeight: "600", color: "#0f172a" }}>{p.name}</span>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>SKU: {p.code}</span>
                      </div>
                    </td>
                    <td>
                      {isPublished ? (
                        <span className="badge badge-success" style={{ background: "#dcfce7", color: "#15803d", padding: "4px 8px", borderRadius: "9999px", fontSize: "12px", fontWeight: "600" }}>Publicada</span>
                      ) : isDraft ? (
                        <span className="badge badge-warning" style={{ background: "#fef9c3", color: "#a16207", padding: "4px 8px", borderRadius: "9999px", fontSize: "12px", fontWeight: "600" }}>Borrador</span>
                      ) : (
                        <span className="badge badge-neutral" style={{ background: "#f1f5f9", color: "#475569", padding: "4px 8px", borderRadius: "9999px", fontSize: "12px", fontWeight: "600" }}>Sin Ficha</span>
                      )}
                    </td>
                    <td>
                      {p.qr ? (
                        <button
                          onClick={() => setActiveQrProduct(p)}
                          className="button-link"
                          style={{ display: "flex", alignItems: "center", gap: "6px", color: "#2320DA", border: "none", background: "none", cursor: "pointer", fontWeight: "600" }}
                        >
                          <QrCode size={16} />
                          Ver QR
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerateQr(p)}
                          disabled={generatingId === p.id}
                          className="button button-sm button-neutral"
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                        >
                          {generatingId === p.id ? "Generando..." : "Generar QR"}
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontSize: "13px", color: "#475569" }}>
                        {p._count.specifications} espec. / {p._count.variants} var.
                      </span>
                    </td>
                    <td style={{ textAlign: "center", fontWeight: "600" }}>
                      {p.stats.scans} <span style={{ fontSize: "11px", fontWeight: "normal", color: "#64748b" }}>({p.stats.last7Days})</span>
                    </td>
                    <td style={{ textAlign: "center", fontWeight: "600" }}>
                      {p.stats.whatsappClicks}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <Link
                          href={`/admin/fichas/${p.id}`}
                          className="button button-icon"
                          title="Editar Ficha"
                          style={{ padding: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px" }}
                        >
                          <Edit size={16} />
                        </Link>
                        {isPublished && (
                          <a
                            href={`/p/${p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="button button-icon"
                            title="Ver en tienda"
                            style={{ padding: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px" }}
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <footer className="admin-table-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
          <p className="muted" style={{ fontSize: "14px" }}>
            Mostrando {products.length} de {total} productos
          </p>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="button button-neutral"
              style={{ padding: "6px 12px" }}
            >
              Anterior
            </button>
            <span style={{ alignSelf: "center", fontSize: "14px", fontWeight: "600" }}>
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
              className="button button-neutral"
              style={{ padding: "6px 12px" }}
            >
              Siguiente
            </button>
          </div>
        </footer>
      )}

      {/* QR Viewer Modal */}
      {activeQrProduct && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="panel modal-card" style={{ width: "100%", maxWidth: "420px", padding: "24px", position: "relative" }}>
            <button
              onClick={() => setActiveQrProduct(null)}
              className="close-button"
              style={{ position: "absolute", right: "16px", top: "16px", background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}
            >
              &times;
            </button>

            <div className="stack-md" style={{ textAlign: "center" }}>
              <h3>Código QR - {activeQrProduct.name}</h3>
              <p className="muted" style={{ fontSize: "13px" }}>Destino: {activeQrProduct.qr?.destUrl}</p>

              {activeQrProduct.qr?.imageUrl ? (
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", display: "inline-block", margin: "12px auto" }}>
                  <img src={activeQrProduct.qr.imageUrl} alt="QR Code" style={{ width: "200px", height: "200px" }} />
                </div>
              ) : (
                <p style={{ color: "#ef4444" }}>No se ha generado el código QR.</p>
              )}

              <div className="stack-xs" style={{ width: "100%" }}>
                <button
                  onClick={() => activeQrProduct.qr?.destUrl && copyToClipboard(activeQrProduct.qr.destUrl, "qrurl")}
                  className="button button-neutral"
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  {copiedId === "qrurl" ? <Check size={16} /> : <Copy size={16} />}
                  {copiedId === "qrurl" ? "Copiado!" : "Copiar URL del Producto"}
                </button>
                {activeQrProduct.qr?.imageUrl && (
                  <a
                    href={activeQrProduct.qr.imageUrl}
                    download={`QR-${activeQrProduct.code}.png`}
                    className="button button-primary"
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#2320DA", color: "white", textDecoration: "none", padding: "10px 0", borderRadius: "8px", fontWeight: "600" }}
                  >
                    Descargar Código QR
                  </a>
                )}
                <button
                  onClick={() => {
                    window.open(`/admin/fichas/print?ids=${activeQrProduct.id}`, "_blank");
                  }}
                  className="button button-neutral"
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  <Printer size={16} />
                  Imprimir Tarjeta Góndola
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
