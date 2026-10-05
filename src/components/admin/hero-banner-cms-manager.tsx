"use client";

import Link from "next/link";
import { DateTimeInput } from "./date-time-input";
import { useActionState, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  MonitorSmartphone,
  Plus,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HERO_BANNER_LAYOUTS,
  getHeroBannerLayoutMeta,
  type HeroBannerLayout,
  type HeroBannerView,
} from "@/lib/hero-banners";
import { HeroBannerVisual } from "@/components/catalog/hero-banner-visual";
import {
  deleteHeroBannerAction,
  duplicateHeroBannerAction,
  reorderHeroBannersAction,
  toggleHeroBannerAction,
  upsertHeroBannerAction,
} from "@/app/admin/banners/actions";
import {
  type HeroBannerActionState,
  type HeroBannerFormValues,
} from "@/components/admin/hero-banner-form-state";

type HeroBannerCmsManagerProps = {
  banners: HeroBannerView[];
  selectedBannerId?: string;
  initialState: HeroBannerActionState;
};

type UploadTarget = "desktopImageUrl" | "mobileImageUrl";

async function uploadHeroBannerFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("El banner debe ser una imagen.");
  }

  const formData = new FormData();
  formData.set("file", file);
  formData.set("folder", "hero");

  const response = await fetch("/api/admin/uploads", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    desktopUrl?: string;
    mobileUrl?: string;
    thumbUrl?: string;
  };

  if (!response.ok || (!payload.desktopUrl && !payload.url)) {
    throw new Error(payload.error ?? "No se pudo subir el archivo.");
  }

  return payload;
}

function formatSchedule(value: string | null) {
  if (!value) {
    return "Sin programación";
  }

  return new Intl.DateTimeFormat("es-PE", {
    hour12: true,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getBannerLabel(slot: HeroBannerView["slot"]) {
  switch (slot) {
    case "CATEGORY":
      return "Categoría";
    case "PROMO":
      return "Promo";
    case "LANDING":
      return "Landing";
    case "WIDGET":
      return "Widget";
    case "HERO":
    default:
      return "Hero";
  }
}

function getStatusTone(value: HeroBannerView["statusLabel"]) {
  switch (value) {
    case "Activo":
      return "success";
    case "Programado":
      return "warning";
    case "Expirado":
      return "danger";
    case "Borrador":
    default:
      return "muted";
  }
}

function BannerImageField({
  label,
  description,
  name,
  value,
  onValueChange,
  helper,
}: {
  label: string;
  description: string;
  helper: string;
  name: UploadTarget;
  value: string;
  onValueChange: (nextValue: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const payload = await uploadHeroBannerFile(file);
      const nextValue = name === "mobileImageUrl"
        ? payload.mobileUrl ?? payload.desktopUrl ?? payload.url ?? ""
        : payload.desktopUrl ?? payload.url ?? "";

      onValueChange(nextValue);
      setMessage("Archivo optimizado y listo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo subir.");
    } finally {
      setUploading(false);
      event.currentTarget.value = "";
    }
  }

  return (
    <div className="hero-banner-upload-field">
      <div className="hero-banner-upload-copy">
        <span>{label}</span>
        <small>{description}</small>
      </div>
      <label className="upload-button">
        <input accept="image/png,image/jpg,image/jpeg,image/webp,image/*" onChange={handleUpload} type="file" />
        <Upload size={16} />
        <span>{uploading ? "Subiendo..." : "Elegir archivo"}</span>
      </label>
      <input
        name={name}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={helper}
        inputMode="url"
        type="text"
        value={value}
      />
      <small className="field-caption">
        {helper}
        {message ? ` · ${message}` : ""}
      </small>
    </div>
  );
}

function BannerPreviewPane({ draft }: { draft: HeroBannerFormValues }) {
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | "split">("desktop");
  const previewBanner = {
    title: draft.title || null,
    subtitle: draft.subtitle || null,
    description: draft.description || null,
    ctaLabel: draft.ctaLabel || null,
    ctaHref: draft.ctaHref || null,
    desktopImageUrl: draft.desktopImageUrl,
    mobileImageUrl: draft.mobileImageUrl || null,
    altText: draft.altText || null,
    overlayColor: draft.overlayColor,
    overlayOpacity: Number(draft.overlayOpacity || "0.36"),
    textAlign: draft.textAlign,
    contentPosition: draft.contentPosition,
    layout: draft.layout,
    campaignName: draft.campaignName || null,
  };
  const layoutMeta = getHeroBannerLayoutMeta(draft.layout);

  return (
    <aside className="hero-banner-preview-panel">
      <div className="panel-header hero-banner-preview-header">
        <div>
          <p className="eyebrow">Vista previa</p>
          <h2>Desktop y mobile</h2>
        </div>
        <span className="pill">
          <Sparkles size={14} />
          {layoutMeta.label}
        </span>
      </div>

      <div className="hero-banner-preview-switcher" role="tablist" aria-label="Vista previa">
        <button
          aria-pressed={previewMode === "desktop"}
          className={cn("hero-banner-preview-switcher-btn", previewMode === "desktop" && "is-active")}
          onClick={() => setPreviewMode("desktop")}
          type="button"
        >
          <MonitorSmartphone size={15} />
          Desktop
        </button>
        <button
          aria-pressed={previewMode === "mobile"}
          className={cn("hero-banner-preview-switcher-btn", previewMode === "mobile" && "is-active")}
          onClick={() => setPreviewMode("mobile")}
          type="button"
        >
          <Smartphone size={15} />
          Mobile
        </button>
        <button
          aria-pressed={previewMode === "split"}
          className={cn("hero-banner-preview-switcher-btn", previewMode === "split" && "is-active")}
          onClick={() => setPreviewMode("split")}
          type="button"
        >
          <LayoutGrid size={15} />
          Ambos
        </button>
      </div>

      <div className={cn("hero-banner-preview-grid", previewMode === "split" && "is-split")}>
        {(previewMode === "desktop" || previewMode === "split") ? (
          <article className="hero-banner-preview-card">
            <div className="hero-banner-preview-meta">
              <MonitorSmartphone size={16} />
              <span>Desktop</span>
              <small>{layoutMeta.recommendedDesktopSize}</small>
            </div>
            <div className="hero-banner-preview-frame is-desktop">
              <HeroBannerVisual banner={previewBanner} eager mode="desktop" />
            </div>
          </article>
        ) : null}

        {(previewMode === "mobile" || previewMode === "split") ? (
          <article className="hero-banner-preview-card">
            <div className="hero-banner-preview-meta">
              <Smartphone size={16} />
              <span>Mobile</span>
              <small>{layoutMeta.recommendedMobileSize}</small>
            </div>
            <div className="hero-banner-preview-frame is-mobile">
              <HeroBannerVisual banner={previewBanner} eager mode="mobile" />
            </div>
          </article>
        ) : null}
      </div>

      <div className="hero-banner-guidance">
        <div>
          <strong>{layoutMeta.label}</strong>
          <p>{layoutMeta.description}</p>
        </div>
        <div className="hero-banner-guidance-stats">
          <span>Ratio {layoutMeta.ratioLabel}</span>
          <span>{draft.isActive ? "Activo" : "Borrador"}</span>
        </div>
      </div>
    </aside>
  );
}

export function HeroBannerCmsManager({
  banners,
  selectedBannerId,
  initialState,
}: HeroBannerCmsManagerProps) {
  const [items, setItems] = useState<HeroBannerView[]>(banners);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const reorderFormRef = useRef<HTMLFormElement | null>(null);
  const [orderIds, setOrderIds] = useState<string[]>(() => banners.map((item) => item.id));
  const selectedBanner = useMemo(
    () => items.find((item) => item.id === selectedBannerId) ?? null,
    [items, selectedBannerId],
  );
  const [editorState, formAction] = useActionState(upsertHeroBannerAction, initialState);
  const [draft, setDraft] = useState<HeroBannerFormValues>(editorState.values);

  function updateDraft<K extends keyof HeroBannerFormValues>(key: K, value: HeroBannerFormValues[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateBannerImage(target: UploadTarget, nextValue: string) {
    setDraft((current) => {
      const nextDraft = {
        ...current,
        [target]: nextValue,
      };

      if (target === "mobileImageUrl" && nextValue.trim() && !current.desktopImageUrl.trim()) {
        nextDraft.desktopImageUrl = nextValue;
      }

      return nextDraft;
    });
  }

  function submitReorder(nextIds: string[]) {
    setOrderIds(nextIds);

    window.setTimeout(() => {
      reorderFormRef.current?.requestSubmit();
    }, 0);
  }

  function reorderList(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }

    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === sourceId);
      const toIndex = current.findIndex((item) => item.id === targetId);

      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }

      const next = current.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      submitReorder(next.map((item) => item.id));

      return next;
    });
  }

  function moveBanner(sourceId: string, direction: -1 | 1) {
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === sourceId);
      const toIndex = fromIndex + direction;

      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) {
        return current;
      }

      const next = current.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      submitReorder(next.map((item) => item.id));

      return next;
    });
  }

  return (
    <section className="panel hero-banner-cms">
      {editorState.message ? <p className="error-text auth-error">{editorState.message}</p> : null}

      <div className="hero-banner-cms-grid">
        <section className="hero-banner-list-panel">
          <div className="hero-banner-list-head">
            <div>
              <p className="eyebrow">Listado</p>
              <h2>Orden y estado</h2>
            </div>
            <div className="hero-banner-list-head-actions">
              <span className="pill">
                <GripVertical size={14} />
                Arrastra la tarjeta o usa las flechas
              </span>
              <Link className="button button-primary button-chip hero-banner-primary-action" href="/admin/banners">
                <Plus size={16} />
                Nuevo banner
              </Link>
            </div>
          </div>

          <form ref={reorderFormRef} action={reorderHeroBannersAction}>
            <input name="orderIds" type="hidden" value={JSON.stringify(orderIds)} />
          </form>

          <div className="hero-banner-list">
              {items.length ? (
                items.map((banner, index) => (
                <article
                  aria-current={selectedBanner?.id === banner.id ? "true" : undefined}
                  className={cn(
                    "hero-banner-list-card",
                    selectedBanner?.id === banner.id && "is-selected",
                    draggingId === banner.id && "is-dragging",
                  )}
                  key={banner.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingId(banner.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggingId) {
                      reorderList(draggingId, banner.id);
                      setDraggingId(null);
                    }
                  }}
                  title="Arrastra la tarjeta para reordenar"
                >
                  <div className="hero-banner-list-card-top">
                    <span
                      className="hero-banner-drag-handle"
                      aria-hidden="true"
                      title="Arrastra para reordenar"
                    >
                      <GripVertical size={16} />
                    </span>
                    <div className="hero-banner-list-card-main">
                      <div className="hero-banner-list-card-title">
                        <strong>{banner.title || "Banner sin título"}</strong>
                        <span className="pill">{getBannerLabel(banner.slot)}</span>
                      </div>
                      <p>{banner.subtitle || banner.description || "Sin descripción"}</p>
                    </div>
                    <div className="hero-banner-list-card-top-right">
                      <span className={`hero-banner-state is-${getStatusTone(banner.statusLabel)}`}>
                        {banner.statusLabel}
                      </span>
                      <div className="hero-banner-reorder-controls" aria-label="Reordenar banner">
                        <button
                          className="hero-banner-reorder-button"
                          disabled={index === 0}
                          onClick={() => moveBanner(banner.id, -1)}
                          type="button"
                          aria-label="Mover banner hacia arriba"
                          title="Mover hacia arriba"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          className="hero-banner-reorder-button"
                          disabled={index === items.length - 1}
                          onClick={() => moveBanner(banner.id, 1)}
                          type="button"
                          aria-label="Mover banner hacia abajo"
                          title="Mover hacia abajo"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="hero-banner-list-card-body">
                    <div className="hero-banner-list-thumb">
                      <HeroBannerVisual banner={banner} eager={index === 0} mode="mobile" />
                    </div>
                    <div className="hero-banner-list-metrics">
                      <p>{banner.campaignName || "Sin campaña"}</p>
                      <span>{banner.recommendedDesktopSize} · {banner.recommendedMobileSize}</span>
                      <small>
                        Orden {banner.sortOrder} · Prioridad {banner.priority} ·{" "}
                        {formatSchedule(banner.startsAt)}
                      </small>
                      <small>Clicks {banner.clickCount} · Impresiones {banner.impressionCount}</small>
                      <small>{banner.mobileImageUrl ? "Mobile ready" : "Fallback desktop en mobile"}</small>
                    </div>
                  </div>

                  <div className="hero-banner-list-actions">
                    <Link className="button button-ghost button-chip" href={`/admin/banners?banner=${banner.id}`}>
                      Editar
                    </Link>
                    <form action={duplicateHeroBannerAction}>
                      <input name="bannerId" type="hidden" value={banner.id} />
                      <button className="button button-ghost button-chip" type="submit">
                        <Copy size={16} />
                        Duplicar
                      </button>
                    </form>
                    <form action={toggleHeroBannerAction}>
                      <input name="bannerId" type="hidden" value={banner.id} />
                      <button className="button button-ghost button-chip" type="submit">
                        {banner.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                        {banner.isActive ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                    <form action={deleteHeroBannerAction}>
                      <input name="bannerId" type="hidden" value={banner.id} />
                      <button className="button button-ghost button-chip" type="submit">
                        <Trash2 size={16} />
                        Eliminar
                      </button>
                    </form>
                  </div>
                </article>
              ))
            ) : (
              <article className="hero-banner-empty-state">
                <Sparkles size={24} />
                <strong>No hay banners creados</strong>
                <p>Empieza con una campaña nueva o importa los slides heredados del hero anterior.</p>
                <div className="hero-banner-empty-actions">
                  <Link className="button button-primary button-chip" href="/admin/banners">
                    <Plus size={16} />
                    Crear banner
                  </Link>
                </div>
              </article>
            )}
          </div>
        </section>

        <section className="hero-banner-editor-panel">
          <div className="hero-banner-editor-head">
            <div>
              <p className="eyebrow">{selectedBanner ? "Editar banner" : "Nuevo banner"}</p>
              <h2>{selectedBanner?.title || "Crear campaña"}</h2>
              <p className="field-caption">
                Usa el layout correcto y sube una imagen limpia para desktop y mobile.
              </p>
            </div>
          </div>

          <div className="hero-banner-editor-body">
            <form action={formAction} className="hero-banner-editor-form">
              <input name="bannerId" type="hidden" value={draft.bannerId} />

              <div className="form-grid">
              <label className="field">
                <span>Slot</span>
                <select name="slot" value={draft.slot} onChange={(event) => updateDraft("slot", event.target.value as HeroBannerFormValues["slot"])}>
                  <option value="HERO">Hero principal</option>
                  <option value="CATEGORY">Banner de categoría</option>
                  <option value="PROMO">Promo</option>
                  <option value="LANDING">Landing</option>
                  <option value="WIDGET">Widget</option>
                </select>
              </label>

              <label className="field">
                <span>Layout</span>
                <select
                  name="layout"
                  value={draft.layout}
                  onChange={(event) => updateDraft("layout", event.target.value as HeroBannerLayout)}
                >
                  {HERO_BANNER_LAYOUTS.map((layout) => (
                    <option key={layout.layout} value={layout.layout}>
                      {layout.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field-wide">
                <span>Título</span>
                <input
                  name="title"
                  value={draft.title}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder="Campaña principal"
                />
              </label>

              <label className="field field-wide">
                <span>Subtítulo</span>
                <input
                  name="subtitle"
                  value={draft.subtitle}
                  onChange={(event) => updateDraft("subtitle", event.target.value)}
                  placeholder="Oferta especial por temporada"
                />
              </label>

              <label className="field field-wide">
                <span>Descripción</span>
                <textarea
                  name="description"
                  rows={4}
                  value={draft.description}
                  onChange={(event) => updateDraft("description", event.target.value)}
                  placeholder="Texto de apoyo para la campaña"
                />
              </label>

              <label className="field">
                <span>Botón CTA</span>
                <input
                  name="ctaLabel"
                  value={draft.ctaLabel}
                  onChange={(event) => updateDraft("ctaLabel", event.target.value)}
                  placeholder="Ver oferta"
                />
              </label>

              <label className="field field-wide">
                <span>Enlace CTA</span>
                <input
                  name="ctaHref"
                  value={draft.ctaHref}
                  onChange={(event) => updateDraft("ctaHref", event.target.value)}
                  placeholder="/?collection=ofertas"
                />
              </label>

              <label className="field">
                <span>Campaña</span>
                <input
                  name="campaignName"
                  value={draft.campaignName}
                  onChange={(event) => updateDraft("campaignName", event.target.value)}
                  placeholder="Navidad 2026"
                />
              </label>

              <label className="field">
                <span>Analytics key</span>
                <input
                  name="analyticsKey"
                  value={draft.analyticsKey}
                  onChange={(event) => updateDraft("analyticsKey", event.target.value)}
                  placeholder="navidad-home-hero"
                />
              </label>

              <label className="field field-wide">
                <span>Texto alternativo</span>
                <input
                  name="altText"
                  value={draft.altText}
                  onChange={(event) => updateDraft("altText", event.target.value)}
                  placeholder="Banner principal de campaña"
                />
              </label>

              <label className="field">
                <span>Color overlay</span>
                <input
                  name="overlayColor"
                  type="color"
                  value={draft.overlayColor}
                  onChange={(event) => updateDraft("overlayColor", event.target.value)}
                />
              </label>

              <label className="field">
                <span>Opacidad overlay</span>
                <input
                  name="overlayOpacity"
                  min={0}
                  max={1}
                  step={0.05}
                  type="range"
                  value={draft.overlayOpacity}
                  onChange={(event) => updateDraft("overlayOpacity", event.target.value)}
                />
              </label>

              <label className="field">
                <span>Alineación texto</span>
                <select
                  name="textAlign"
                  value={draft.textAlign}
                  onChange={(event) => updateDraft("textAlign", event.target.value as HeroBannerFormValues["textAlign"])}
                >
                  <option value="LEFT">Izquierda</option>
                  <option value="CENTER">Centro</option>
                  <option value="RIGHT">Derecha</option>
                </select>
              </label>

              <label className="field">
                <span>Posición contenido</span>
                <select
                  name="contentPosition"
                  value={draft.contentPosition}
                  onChange={(event) =>
                    updateDraft(
                      "contentPosition",
                      event.target.value as HeroBannerFormValues["contentPosition"],
                    )
                  }
                >
                  <option value="LEFT">Izquierda</option>
                  <option value="CENTER">Centro</option>
                  <option value="RIGHT">Derecha</option>
                </select>
              </label>

              <label className="field">
                <span>Prioridad</span>
                <input
                  name="priority"
                  type="number"
                  value={draft.priority}
                  onChange={(event) => updateDraft("priority", event.target.value)}
                />
              </label>

              <label className="field">
                <span>Orden</span>
                <input
                  name="sortOrder"
                  type="number"
                  value={draft.sortOrder}
                  onChange={(event) => updateDraft("sortOrder", event.target.value)}
                />
              </label>

              <div className="hero-banner-schedule-grid">
                <DateTimeInput
                  label="Fecha inicio"
                  name="startsAt"
                  value={draft.startsAt}
                  onChange={(value) => updateDraft("startsAt", value)}
                />

                <DateTimeInput
                  label="Fecha fin"
                  name="endsAt"
                  value={draft.endsAt}
                  onChange={(value) => updateDraft("endsAt", value)}
                />

                <label className="field field-inline-check hero-banner-active-field">
                  <input
                    checked={draft.isActive}
                    name="isActive"
                    onChange={(event) => updateDraft("isActive", event.target.checked)}
                    type="checkbox"
                  />
                  <span>Banner activo</span>
                </label>
              </div>
              </div>

              <div className="hero-banner-upload-grid">
                <BannerImageField
                  description="Imagen principal para escritorio."
                  helper="Pega una URL o sube un archivo optimizado."
                  label="Desktop"
                  name="desktopImageUrl"
                  onValueChange={(nextValue) => updateBannerImage("desktopImageUrl", nextValue)}
                  value={draft.desktopImageUrl}
                />

                <BannerImageField
                  description="Versión para móvil. Si no la subes, se usa la de desktop."
                  helper="Pega una URL o sube un archivo optimizado."
                  label="Mobile"
                  name="mobileImageUrl"
                  onValueChange={(nextValue) => updateBannerImage("mobileImageUrl", nextValue)}
                  value={draft.mobileImageUrl}
                />
              </div>

              <div className="actions-row hero-banner-editor-actions">
                <div className="hero-banner-editor-note">
                  <LayoutGrid size={16} />
                  <span>{getHeroBannerLayoutMeta(draft.layout).description}</span>
                </div>
                <button className="button button-primary" type="submit">
                  Guardar banner
                </button>
              </div>
            </form>

            <BannerPreviewPane draft={draft} />
          </div>
        </section>
      </div>
    </section>
  );
}
