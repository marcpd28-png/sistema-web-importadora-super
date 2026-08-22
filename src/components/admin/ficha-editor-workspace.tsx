"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Save,
  QrCode,
  Play,
  FileText,
  Upload,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  Info
} from "lucide-react";
import { parseYouTubeUrl } from "@/lib/youtube";

type ProductWithFichaDetails = {
  id: string;
  name: string;
  code: string;
  unitPrice: any;
  wholesalePrice: any;
  wholesaleMinQty: number;
  imageUrl: string | null;
  slug: string;
  digitalProfile: {
    status: string;
    descriptionShort: string | null;
    descriptionFull: string | null;
  } | null;
  specifications: { id: string; name: string; value: string; sortOrder: number }[];
  variants: { id: string; name: string; hexColor: string | null; imageUrl: string | null; sku: string | null; isAvailable: boolean; sortOrder: number }[];
  videos: { id: string; title: string; url: string; provider: string; videoId: string; thumbnailUrl: string | null; sortOrder: number }[];
  documents: { id: string; title: string; url: string; type: string; sortOrder: number }[];
  qr: { destUrl: string; imageUrl: string | null } | null;
};

type FichaEditorWorkspaceProps = {
  product: ProductWithFichaDetails;
  status?: string;
};

export function FichaEditorWorkspace({ product, status }: FichaEditorWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Accordion active sections
  const [activeTab, setActiveTab] = useState<"general" | "specs" | "variants" | "videos" | "docs">("general");

  // Real-time states
  const [descriptionShort, setDescriptionShort] = useState(product.digitalProfile?.descriptionShort || "");
  const [descriptionFull, setDescriptionFull] = useState(product.digitalProfile?.descriptionFull || "");
  const [profileStatus, setProfileStatus] = useState(product.digitalProfile?.status || "BORRADOR");

  const [specifications, setSpecifications] = useState(product.specifications);
  const [variants, setVariants] = useState(product.variants);
  const [videos, setVideos] = useState(product.videos);
  const [documents, setDocuments] = useState(product.documents);

  // File uploading flags
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  // Preview interactive state
  const [selectedPreviewColorIndex, setSelectedPreviewColorIndex] = useState(0);
  const [previewVideoPlaying, setPreviewVideoPlaying] = useState<string | null>(null);

  // Helpers for Lists
  function addSpecification() {
    setSpecifications((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: "",
        value: "",
        sortOrder: prev.length,
      },
    ]);
  }

  function updateSpecification(index: number, key: "name" | "value", val: string) {
    setSpecifications((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: val } : item))
    );
  }

  function moveSpecification(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === specifications.length - 1) return;

    const nextIdx = direction === "up" ? index - 1 : index + 1;
    const nextList = [...specifications];
    const temp = nextList[index];
    nextList[index] = nextList[nextIdx];
    nextList[nextIdx] = temp;

    // re-sortOrder
    setSpecifications(nextList.map((item, idx) => ({ ...item, sortOrder: idx })));
  }

  function removeSpecification(index: number) {
    setSpecifications((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Variants helpers
  function addVariant() {
    setVariants((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: "",
        hexColor: "#2320DA",
        imageUrl: "",
        sku: `${product.code}-${prev.length + 1}`,
        isAvailable: true,
        sortOrder: prev.length,
      },
    ]);
  }

  function updateVariant(index: number, key: string, val: any) {
    setVariants((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: val } : item))
    );
  }

  async function handleVariantImageUpload(index: number, file: File) {
    const id = variants[index].id;
    setUploadingVariantId(id);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      updateVariant(index, "imageUrl", data.url);
    } catch (error) {
      console.error(error);
      alert("Error al cargar la imagen de la variante.");
    } finally {
      setUploadingVariantId(null);
    }
  }

  function moveVariant(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === variants.length - 1) return;

    const nextIdx = direction === "up" ? index - 1 : index + 1;
    const nextList = [...variants];
    const temp = nextList[index];
    nextList[index] = nextList[nextIdx];
    nextList[nextIdx] = temp;

    setVariants(nextList.map((item, idx) => ({ ...item, sortOrder: idx })));
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Videos helpers
  function addVideo() {
    setVideos((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        title: "",
        url: "",
        provider: "YOUTUBE",
        videoId: "",
        thumbnailUrl: null,
        sortOrder: prev.length,
      },
    ]);
  }

  function updateVideo(index: number, url: string) {
    const parsed = parseYouTubeUrl(url);
    if (parsed) {
      setVideos((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                url,
                provider: parsed.provider,
                videoId: parsed.videoId,
                thumbnailUrl: parsed.thumbnailUrl,
              }
            : item
        )
      );
    } else {
      setVideos((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                url,
                videoId: "",
                thumbnailUrl: null,
              }
            : item
        )
      );
    }
  }

  function updateVideoTitle(index: number, title: string) {
    setVideos((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, title } : item))
    );
  }

  function moveVideo(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === videos.length - 1) return;

    const nextIdx = direction === "up" ? index - 1 : index + 1;
    const nextList = [...videos];
    const temp = nextList[index];
    nextList[index] = nextList[nextIdx];
    nextList[nextIdx] = temp;

    setVideos(nextList.map((item, idx) => ({ ...item, sortOrder: idx })));
  }

  function removeVideo(index: number) {
    setVideos((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Documents helpers
  function addDocument() {
    setDocuments((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        title: "",
        url: "",
        type: "PDF",
        sortOrder: prev.length,
      },
    ]);
  }

  function updateDocument(index: number, key: string, val: string) {
    setDocuments((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: val } : item))
    );
  }

  async function handleDocUpload(index: number, file: File) {
    const id = documents[index].id;
    setUploadingDocId(id);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      updateDocument(index, "url", data.url);
      if (!documents[index].title) {
        updateDocument(index, "title", file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch (error) {
      console.error(error);
      alert("Error al cargar el archivo de documento.");
    } finally {
      setUploadingDocId(null);
    }
  }

  function moveDocument(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === documents.length - 1) return;

    const nextIdx = direction === "up" ? index - 1 : index + 1;
    const nextList = [...documents];
    const temp = nextList[index];
    nextList[index] = nextList[nextIdx];
    nextList[nextIdx] = temp;

    setDocuments(nextList.map((item, idx) => ({ ...item, sortOrder: idx })));
  }

  function removeDocument(index: number) {
    setDocuments((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Save changes action handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("productId", product.id);
        formData.append("descriptionShort", descriptionShort);
        formData.append("descriptionFull", descriptionFull);
        formData.append("status", profileStatus);
        formData.append("specifications", JSON.stringify(specifications));
        formData.append("variants", JSON.stringify(variants));
        formData.append("videos", JSON.stringify(videos));
        formData.append("documents", JSON.stringify(documents));

        const res = await fetch("/api/admin/fichas/save", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Save failed");
        }

        router.push(`/admin/fichas/${product.id}?status=updated`);
        router.refresh();
      } catch (error) {
        console.error(error);
        alert("Hubo un error al guardar los cambios.");
      }
    });
  }

  // QR trigger
  async function handleGenerateQr() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("productId", product.id);
        const res = await fetch("/api/admin/fichas/generate-qr", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("QR Generation failed");
        router.push(`/admin/fichas/${product.id}?status=qr_generated`);
        router.refresh();
      } catch (error) {
        console.error(error);
        alert("Error al generar el QR.");
      }
    });
  }

  // Preview properties
  const activePreviewVariant = variants[selectedPreviewColorIndex] || null;
  const previewImage = activePreviewVariant?.imageUrl || product.imageUrl;

  return (
    <div className="admin-workspace stack-md" style={{ padding: "10px 0" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <Link
          href="/admin/fichas"
          className="button button-neutral"
          style={{ display: "flex", alignItems: "center", gap: "6px", textDecoration: "none" }}
        >
          <ChevronLeft size={16} />
          Volver a la lista
        </Link>

        <div style={{ display: "flex", gap: "10px" }}>
          {product.qr ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#475569" }}>
              <span className="badge badge-success" style={{ background: "#dcfce7", color: "#15803d", padding: "4px 8px", borderRadius: "9999px" }}>QR Generado</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerateQr}
              disabled={isPending}
              className="button button-neutral"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <QrCode size={16} />
              Generar QR
            </button>
          )}
          {profileStatus === "PUBLICADA" && (
            <a
              href={`/p/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="button button-neutral"
              style={{ display: "flex", alignItems: "center", gap: "6px", textDecoration: "none" }}
            >
              Ver Ficha Pública
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>

      {status === "updated" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#dcfce7", color: "#15803d", padding: "12px 16px", borderRadius: "8px", fontSize: "14px", fontWeight: "600" }}>
          <CheckCircle size={18} />
          Los cambios en la ficha digital han sido guardados correctamente.
        </div>
      )}

      {status === "qr_generated" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#dcfce7", color: "#15803d", padding: "12px 16px", borderRadius: "8px", fontSize: "14px", fontWeight: "600" }}>
          <CheckCircle size={18} />
          Código QR único generado exitosamente.
        </div>
      )}

      {/* Title & SKU */}
      <header className="stack-xxs">
        <h1 style={{ margin: 0, fontSize: "24px" }}>Editar Ficha Digital: {product.name}</h1>
        <p className="muted" style={{ margin: 0 }}>SKU Base: {product.code}</p>
      </header>

      {/* Main Split-Screen Container */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "24px", alignItems: "start" }}>
        
        {/* Left Form Panel */}
        <form onSubmit={handleSubmit} className="stack-md">
          
          {/* Section Accordions */}
          <div className="stack-sm">
            
            {/* Accordion 1: General Info */}
            <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: "10px" }}>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "general" ? "" as any : "general")}
                style={{ width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "none", borderBottom: "1px solid #e2e8f0", cursor: "pointer", fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}
              >
                <span>1. Información General y Estado</span>
                <ChevronDown size={18} style={{ transform: activeTab === "general" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {activeTab === "general" && (
                <div style={{ padding: "20px" }} className="stack-md">
                  <div className="stack-xs">
                    <label style={{ fontSize: "13px", fontWeight: "600" }}>Descripción Comercial Corta</label>
                    <textarea
                      value={descriptionShort}
                      onChange={(e) => setDescriptionShort(e.target.value)}
                      placeholder="Breve frase llamativa o gancho comercial..."
                      rows={2}
                      maxLength={180}
                      style={{ padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                    <p style={{ fontSize: "11px", color: "#64748b" }}>Máximo 180 caracteres. Aparece debajo del título principal.</p>
                  </div>

                  <div className="stack-xs">
                    <label style={{ fontSize: "13px", fontWeight: "600" }}>Descripción Comercial Completa (HTML o texto enriquecido)</label>
                    <textarea
                      value={descriptionFull}
                      onChange={(e) => setDescriptionFull(e.target.value)}
                      placeholder="Escribe detalles adicionales del producto, características especiales, etc..."
                      rows={6}
                      style={{ padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontFamily: "monospace", fontSize: "13px" }}
                    />
                  </div>

                  <div className="stack-xs">
                    <label style={{ fontSize: "13px", fontWeight: "600" }}>Estado de publicación de la ficha</label>
                    <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                        <input
                          type="radio"
                          name="profileStatus"
                          value="BORRADOR"
                          checked={profileStatus === "BORRADOR"}
                          onChange={() => setProfileStatus("BORRADOR")}
                        />
                        Borrador (Solo visible para administradores)
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                        <input
                          type="radio"
                          name="profileStatus"
                          value="PUBLICADA"
                          checked={profileStatus === "PUBLICADA"}
                          onChange={() => setProfileStatus("PUBLICADA")}
                        />
                        Publicada (Visible públicamente vía escaneo QR)
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: Specifications */}
            <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: "10px" }}>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "specs" ? "" as any : "specs")}
                style={{ width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "none", borderBottom: "1px solid #e2e8f0", cursor: "pointer", fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}
              >
                <span>2. Especificaciones Técnicas ({specifications.length})</span>
                <ChevronDown size={18} style={{ transform: activeTab === "specs" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {activeTab === "specs" && (
                <div style={{ padding: "20px" }} className="stack-md">
                  <p style={{ fontSize: "13px", color: "#64748b" }}>Agrega especificaciones del producto. El orden establecido aquí será el mismo que verá el cliente.</p>

                  <div className="stack-sm">
                    {specifications.map((spec, index) => (
                      <div key={spec.id} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="text"
                          value={spec.name}
                          placeholder="Característica (ej: Potencia)"
                          onChange={(e) => updateSpecification(index, "name", e.target.value)}
                          style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                        />
                        <input
                          type="text"
                          value={spec.value}
                          placeholder="Valor (ej: 30W RMS)"
                          onChange={(e) => updateSpecification(index, "value", e.target.value)}
                          style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                        />
                        <div style={{ display: "flex", gap: "2px" }}>
                          <button
                            type="button"
                            onClick={() => moveSpecification(index, "up")}
                            disabled={index === 0}
                            style={{ padding: "6px", background: "none", border: "none", cursor: "pointer" }}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSpecification(index, "down")}
                            disabled={index === specifications.length - 1}
                            style={{ padding: "6px", background: "none", border: "none", cursor: "pointer" }}
                          >
                            <ChevronDown size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSpecification(index)}
                            style={{ padding: "6px", color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addSpecification}
                    className="button button-sm button-neutral"
                    style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Plus size={16} />
                    Agregar Característica
                  </button>
                </div>
              )}
            </div>

            {/* Accordion 3: Variants / Colors */}
            <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: "10px" }}>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "variants" ? "" as any : "variants")}
                style={{ width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "none", borderBottom: "1px solid #e2e8f0", cursor: "pointer", fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}
              >
                <span>3. Variantes y Colores ({variants.length})</span>
                <ChevronDown size={18} style={{ transform: activeTab === "variants" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {activeTab === "variants" && (
                <div style={{ padding: "20px" }} className="stack-md">
                  <p style={{ fontSize: "13px", color: "#64748b" }}>Configura colores o versiones del producto. Sube imágenes específicas por variante.</p>

                  <div className="stack-md">
                    {variants.map((v, index) => (
                      <div key={v.id} className="panel" style={{ border: "1px solid #e2e8f0", padding: "14px", borderRadius: "8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
                          <input
                            type="text"
                            value={v.name}
                            placeholder="Nombre (ej: Azul Zafiro)"
                            onChange={(e) => updateVariant(index, "name", e.target.value)}
                            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <input
                              type="color"
                              value={v.hexColor || "#2320DA"}
                              onChange={(e) => updateVariant(index, "hexColor", e.target.value)}
                              style={{ width: "40px", height: "36px", padding: "2px", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer" }}
                            />
                            <input
                              type="text"
                              value={v.hexColor || ""}
                              placeholder="#HEX"
                              onChange={(e) => updateVariant(index, "hexColor", e.target.value)}
                              style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                            />
                          </div>
                          <div style={{ display: "flex", gap: "2px" }}>
                            <button
                              type="button"
                              onClick={() => moveVariant(index, "up")}
                              disabled={index === 0}
                              style={{ padding: "6px", background: "none", border: "none" }}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveVariant(index, "down")}
                              disabled={index === variants.length - 1}
                              style={{ padding: "6px", background: "none", border: "none" }}
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeVariant(index)}
                              style={{ padding: "6px", color: "#ef4444", background: "none", border: "none" }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", alignItems: "center" }}>
                          <input
                            type="text"
                            value={v.sku || ""}
                            placeholder="SKU variante (opcional)"
                            onChange={(e) => updateVariant(index, "sku", e.target.value)}
                            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                          />
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <input
                              type="text"
                              value={v.imageUrl || ""}
                              placeholder="URL Imagen"
                              onChange={(e) => updateVariant(index, "imageUrl", e.target.value)}
                              style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                            />
                            <label style={{ cursor: "pointer", padding: "8px", background: "#f1f5f9", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                              <Upload size={14} />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => e.target.files?.[0] && handleVariantImageUpload(index, e.target.files[0])}
                                style={{ display: "none" }}
                              />
                            </label>
                          </div>
                        </div>
                        {uploadingVariantId === v.id && (
                          <p style={{ fontSize: "11px", color: "#2320DA", margin: "6px 0 0" }}>Cargando imagen al servidor...</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addVariant}
                    className="button button-sm button-neutral"
                    style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Plus size={16} />
                    Agregar Variante / Color
                  </button>
                </div>
              )}
            </div>

            {/* Accordion 4: Videos */}
            <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: "10px" }}>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "videos" ? "" as any : "videos")}
                style={{ width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "none", borderBottom: "1px solid #e2e8f0", cursor: "pointer", fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}
              >
                <span>4. Videos e Instructivos ({videos.length})</span>
                <ChevronDown size={18} style={{ transform: activeTab === "videos" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {activeTab === "videos" && (
                <div style={{ padding: "20px" }} className="stack-md">
                  <p style={{ fontSize: "13px", color: "#64748b" }}>Ingresa enlaces de YouTube o YouTube Shorts. Se detectarán automáticamente los IDs de video para miniaturas.</p>

                  <div className="stack-sm">
                    {videos.map((vid, index) => (
                      <div key={vid.id} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "8px" }}>
                          <input
                            type="text"
                            value={vid.title}
                            placeholder="Título del video (ej: Unboxing)"
                            onChange={(e) => updateVideoTitle(index, e.target.value)}
                            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                          <input
                            type="text"
                            value={vid.url}
                            placeholder="Enlace de YouTube..."
                            onChange={(e) => updateVideo(index, e.target.value)}
                            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: "2px" }}>
                          <button
                            type="button"
                            onClick={() => moveVideo(index, "up")}
                            disabled={index === 0}
                            style={{ padding: "6px", background: "none", border: "none" }}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveVideo(index, "down")}
                            disabled={index === videos.length - 1}
                            style={{ padding: "6px", background: "none", border: "none" }}
                          >
                            <ChevronDown size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeVideo(index)}
                            style={{ padding: "6px", color: "#ef4444", background: "none", border: "none" }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addVideo}
                    className="button button-sm button-neutral"
                    style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Plus size={16} />
                    Agregar Video
                  </button>
                </div>
              )}
            </div>

            {/* Accordion 5: Documents */}
            <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: "10px" }}>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "docs" ? "" as any : "docs")}
                style={{ width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "none", borderBottom: "1px solid #e2e8f0", cursor: "pointer", fontWeight: "bold", fontSize: "15px", color: "#0f172a" }}
              >
                <span>5. Manuales y Documentos ({documents.length})</span>
                <ChevronDown size={18} style={{ transform: activeTab === "docs" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {activeTab === "docs" && (
                <div style={{ padding: "20px" }} className="stack-md">
                  <p style={{ fontSize: "13px", color: "#64748b" }}>Carga manuales PDF, garantías o guías de instalación rápida.</p>

                  <div className="stack-sm">
                    {documents.map((doc, index) => (
                      <div key={doc.id} className="panel" style={{ border: "1px solid #e2e8f0", padding: "12px", borderRadius: "8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                          <input
                            type="text"
                            value={doc.title}
                            placeholder="Nombre del documento..."
                            onChange={(e) => updateDocument(index, "title", e.target.value)}
                            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                          <select
                            value={doc.type}
                            onChange={(e) => updateDocument(index, "type", e.target.value)}
                            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "white" }}
                          >
                            <option value="PDF">Manual PDF</option>
                            <option value="WARRANTY">Garantía Oficial</option>
                            <option value="GUIDE">Guía de Instalación</option>
                          </select>
                          <div style={{ display: "flex", gap: "2px" }}>
                            <button
                              type="button"
                              onClick={() => moveDocument(index, "up")}
                              disabled={index === 0}
                              style={{ padding: "4px", background: "none", border: "none" }}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveDocument(index, "down")}
                              disabled={index === documents.length - 1}
                              style={{ padding: "4px", background: "none", border: "none" }}
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeDocument(index)}
                              style={{ padding: "4px", color: "#ef4444", background: "none", border: "none" }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="text"
                            value={doc.url}
                            placeholder="Enlace o ruta del archivo..."
                            onChange={(e) => updateDocument(index, "url", e.target.value)}
                            style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                          />
                          <label style={{ cursor: "pointer", padding: "8px", background: "#f1f5f9", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}>
                            <Upload size={14} style={{ display: "inline", marginRight: "4px" }} />
                            Subir PDF
                            <input
                              type="file"
                              accept="application/pdf"
                              onChange={(e) => e.target.files?.[0] && handleDocUpload(index, e.target.files[0])}
                              style={{ display: "none" }}
                            />
                          </label>
                        </div>
                        {uploadingDocId === doc.id && (
                          <p style={{ fontSize: "11px", color: "#2320DA", margin: "6px 0 0" }}>Cargando PDF al servidor...</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addDocument}
                    className="button button-sm button-neutral"
                    style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Plus size={16} />
                    Agregar Documento PDF
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Action Bar */}
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <button
              type="submit"
              disabled={isPending}
              className="button button-primary"
              style={{ flex: 1, background: "#2320DA", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", borderRadius: "8px", fontWeight: "bold" }}
            >
              <Save size={18} />
              {isPending ? "Guardando..." : "Guardar Cambios de Ficha"}
            </button>
          </div>

        </form>

        {/* Right iPhone Interactive Mockup */}
        <div style={{ position: "sticky", top: "20px" }} className="stack-xs">
          <p style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
            <Info size={14} />
            Vista Previa Móvil (Real-Time)
          </p>

          <div
            className="phone-frame"
            style={{ width: "320px", height: "640px", border: "10px solid #0f172a", borderRadius: "40px", background: "#f8fafc", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", margin: "0 auto" }}
          >
            {/* Notch */}
            <div style={{ width: "120px", height: "18px", background: "#0f172a", borderRadius: "0 0 12px 12px", position: "absolute", left: "50%", transform: "translateX(-50%)", zIndex: 20 }}></div>

            {/* Mobile Content (Scrollable) */}
            <div style={{ flex: 1, overflowY: "auto", padding: "28px 14px 70px", display: "flex", flexDirection: "column", gap: "14px" }}>
              
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
                <span style={{ fontWeight: "800", fontSize: "11px", color: "#2320DA" }}>IMPORTADORA SUPER</span>
                <span style={{ fontSize: "14px" }}>🛒</span>
              </div>

              {/* Product Hero Image */}
              <div style={{ background: "white", padding: "10px", borderRadius: "10px", display: "flex", justifyContent: "center", alignItems: "center", height: "180px", border: "1px solid #f1f5f9", position: "relative" }}>
                {previewImage ? (
                  <img src={previewImage} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>Sin imagen disponible</div>
                )}
              </div>

              {/* Title & Info */}
              <div className="stack-xxs">
                <h3 style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  {product.name}
                  {activePreviewVariant ? ` - ${activePreviewVariant.name}` : ""}
                </h3>
                {descriptionShort && (
                  <p style={{ fontSize: "12px", color: "#475569", margin: "4px 0 0", fontStyle: "italic" }}>
                    "{descriptionShort}"
                  </p>
                )}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                  <span style={{ background: "#f1f5f9", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", color: "#64748b" }}>SKU: {activePreviewVariant?.sku || product.code}</span>
                  <span style={{ background: "#e0f2fe", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", color: "#0369a1", fontWeight: "600" }}>★ 4.9 (42)</span>
                </div>
              </div>

              {/* Prices */}
              <div style={{ background: "white", padding: "10px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: "10px", color: "#64748b", margin: 0 }}>Precio unitario</p>
                  <p style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a", margin: 0 }}>S/ {Number(product.unitPrice).toFixed(2)}</p>
                </div>
                {product.wholesalePrice && (
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "10px", color: "#16a34a", margin: 0, fontWeight: "600" }}>Mayorista (Min {product.wholesaleMinQty})</p>
                    <p style={{ fontSize: "15px", fontWeight: "800", color: "#16a34a", margin: 0 }}>S/ {Number(product.wholesalePrice).toFixed(2)}</p>
                  </div>
                )}
              </div>

              {/* Colors selector */}
              {variants.length > 0 && (
                <div className="stack-xxs">
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", margin: 0 }}>Colores Disponibles</p>
                  <div style={{ display: "flex", gap: "8px", marginTop: "6px", overflowX: "auto", paddingBottom: "2px" }}>
                    {variants.map((v, idx) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedPreviewColorIndex(idx)}
                        style={{ width: "24px", height: "24px", borderRadius: "50%", background: v.hexColor || "#2320DA", border: selectedPreviewColorIndex === idx ? "2px solid #000" : "1px solid #cbd5e1", outline: selectedPreviewColorIndex === idx ? "2px solid #fff" : "none", cursor: "pointer", padding: 0 }}
                        title={v.name}
                      />
                    ))}
                  </div>
                  <p style={{ fontSize: "11px", color: "#475569", margin: "4px 0 0" }}>Seleccionado: <span style={{ fontWeight: "600" }}>{activePreviewVariant?.name || "Ninguno"}</span></p>
                </div>
              )}

              {/* Videos */}
              {videos.length > 0 && (
                <div className="stack-xxs">
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", margin: 0 }}>Videos Demostrativos</p>
                  <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px", marginTop: "6px" }}>
                    {videos.map((vid) => (
                      <div
                        key={vid.id}
                        onClick={() => vid.videoId && setPreviewVideoPlaying(vid.videoId)}
                        style={{ flexShrink: 0, width: "110px", cursor: "pointer" }}
                      >
                        <div style={{ width: "110px", height: "66px", background: "#cbd5e1", borderRadius: "6px", overflow: "hidden", position: "relative" }}>
                          {vid.thumbnailUrl ? (
                            <img src={vid.thumbnailUrl} alt={vid.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", background: "#475569" }} />
                          )}
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Play size={18} style={{ color: "white" }} />
                          </div>
                        </div>
                        <p style={{ fontSize: "9px", fontWeight: "600", color: "#475569", margin: "4px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vid.title || "Video demostrativo"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Specifications Accordion */}
              {specifications.length > 0 && (
                <div className="stack-xxs" style={{ background: "white", padding: "10px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", margin: "0 0 6px" }}>Especificaciones Técnicas</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {specifications.map((spec) => (
                      <div key={spec.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "4px", fontSize: "11px" }}>
                        <span style={{ color: "#64748b" }}>{spec.name || "Característica"}</span>
                        <span style={{ fontWeight: "600", color: "#0f172a" }}>{spec.value || "Valor"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              {documents.length > 0 && (
                <div className="stack-xxs">
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", margin: "0 0 6px" }}>Manuales y Descargas</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        style={{ background: "white", padding: "8px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
                      >
                        <FileText size={16} style={{ color: "#ef4444" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "11px", fontWeight: "600", color: "#0f172a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title || "Manual de usuario"}</p>
                          <p style={{ fontSize: "9px", color: "#64748b", margin: 0 }}>Descarga Directa PDF</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Sticky Cart Button */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "white", padding: "10px 14px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "8px", zIndex: 10 }}>
              <button
                type="button"
                style={{ flex: 1, background: "#2320DA", color: "white", border: "none", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              >
                Agregar al Carrito
              </button>
            </div>

            {/* Video Player Modal Sim */}
            {previewVideoPlaying && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", justifyContent: "center", zIndex: 50 }}>
                <button
                  type="button"
                  onClick={() => setPreviewVideoPlaying(null)}
                  style={{ position: "absolute", top: "24px", right: "12px", background: "none", border: "none", color: "white", fontSize: "18px", cursor: "pointer" }}
                >
                  &times; Cerrar
                </button>
                <div style={{ width: "100%", height: "180px", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "12px" }}>
                  🎬 Simulando reproductor de YouTube ID: {previewVideoPlaying}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
