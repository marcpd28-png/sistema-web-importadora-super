"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  ShoppingCart,
  Play,
  FileText,
  ChevronDown,
  Plus,
  Minus,
  Check,
  Star,
  ExternalLink,
  MessageCircle,
  HelpCircle
} from "lucide-react";
import { useCartStore, rehydrateCartStore } from "@/components/catalog/cart-store";
import { CartDrawer } from "@/components/catalog/cart-drawer";
import { StoreSideActions } from "@/components/catalog/store-side-actions";
import { formatCurrency } from "@/lib/utils";

type PublicFichaProduct = {
  id: string;
  name: string;
  code: string;
  unitLabel: string;
  unitPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number;
  boxPrice: number | null;
  unitsPerBox: number | null;
  stockUnits: number;
  imageUrl: string | null;
  slug: string;
  digitalProfile: {
    descriptionShort: string | null;
    descriptionFull: string | null;
    status: string;
  };
  specifications: { id: string; name: string; value: string }[];
  variants: { id: string; name: string; hexColor: string | null; imageUrl: string | null; sku: string | null; isAvailable: boolean }[];
  videos: { id: string; title: string; url: string; provider: string; videoId: string; thumbnailUrl: string | null }[];
  documents: { id: string; title: string; url: string; type: string }[];
};

type PublicFichaWorkspaceProps = {
  product: PublicFichaProduct;
  settings: any;
  quoteDefaults: any;
  isAdminView?: boolean;
};

export function PublicFichaWorkspace({
  product,
  settings,
  quoteDefaults,
  isAdminView = false,
}: PublicFichaWorkspaceProps) {
  const addItem = useCartStore((state) => state.addItem);

  // States
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isSpecsOpen, setIsSpecsOpen] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // Rehydrate cart on mount
  useEffect(() => {
    rehydrateCartStore();
  }, []);

  async function trackEvent(eventType: string) {
    if (isAdminView) return; // don't skew metrics with admin views
    try {
      await fetch("/api/p/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, eventType }),
      });
    } catch (e) {
      console.error("Failed to track event:", e);
    }
  }

  const handleBack = () => {
    if (typeof window !== "undefined") {
      if (document.referrer && document.referrer.includes(window.location.host)) {
        window.history.back();
      } else {
        window.location.href = "/";
      }
    }
  };

  const selectedVariant = product.variants[selectedVariantIndex] || null;
  const currentImage = selectedVariant?.imageUrl || product.imageUrl;
  const currentSku = selectedVariant?.sku || product.code;

  const handleAddToCart = () => {
    // Map to the format needed by CartStore
    const productForCart: any = {
      id: product.id,
      code: currentSku,
      name: selectedVariant ? `${product.name} (${selectedVariant.name})` : product.name,
      unitLabel: product.unitLabel,
      unitPrice: product.unitPrice,
      wholesalePrice: product.wholesalePrice,
      wholesaleMinQty: product.wholesaleMinQty,
      boxPrice: product.boxPrice,
      unitsPerBox: product.unitsPerBox,
      stockUnits: product.stockUnits,
      imageUrl: currentImage,
      primaryMedia: currentImage ? {
        id: selectedVariant ? `variant-${selectedVariant.id}` : `base-${product.id}`,
        type: "IMAGE" as const,
        url: currentImage,
        altText: selectedVariant ? selectedVariant.name : product.name,
        sortOrder: 0
      } : null
    };

    const isWholesale = product.wholesalePrice && quantity >= product.wholesaleMinQty;
    const mode = isWholesale ? "wholesale" : "unit";

    addItem(productForCart, mode as any, quantity);
    
    // Dispatch event to open CartDrawer
    window.dispatchEvent(new CustomEvent("store-cart:open"));
    
    trackEvent("ADD_TO_CART_FROM_QR");
  };

  const handlePlayVideo = (videoId: string) => {
    setActiveVideoId(videoId);
    trackEvent("VIDEO_PLAY");
  };

  const handleOpenDoc = (url: string) => {
    trackEvent("DOCUMENT_OPEN");
    window.open(url, "_blank");
  };

  const incrementQty = () => {
    if (quantity < product.stockUnits) {
      setQuantity((prev) => prev + 1);
    }
  };

  const decrementQty = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  const effectivePrice = product.wholesalePrice && quantity >= product.wholesaleMinQty
    ? Number(product.wholesalePrice)
    : Number(product.unitPrice);

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "80px" }}>
      {/* Admin view alert banner */}
      {isAdminView && (
        <div style={{ background: "#ef4444", color: "white", padding: "8px 16px", textTransform: "uppercase", fontSize: "11px", fontWeight: "800", letterSpacing: "0.05em", textAlign: "center", position: "sticky", top: 0, zIndex: 100 }}>
          Vista Previa de Administrador (Borrador)
        </div>
      )}

      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: isAdminView ? "30px" : 0, zIndex: 50 }}>
        <button
          onClick={handleBack}
          style={{ background: "none", border: "none", color: "#334155", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600", padding: "4px 0" }}
        >
          <ArrowLeft size={18} />
          Volver
        </button>
        
        <span style={{ fontWeight: "800", fontSize: "14px", color: "#2320DA", letterSpacing: "0.05em" }}>
          IMPORTADORA SUPER
        </span>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent("store-cart:open"))}
          style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: "6px" }}
        >
          <ShoppingCart size={20} style={{ color: "#334155" }} />
        </button>
      </header>

      {/* Main Content Container */}
      <main style={{ maxWidth: "480px", margin: "0 auto", padding: "16px" }} className="stack-md">
        
        {/* Product Card with Hero Image */}
        <section className="panel" style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ position: "relative", height: "280px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", borderRadius: "12px", border: "1px solid #f1f5f9" }}>
            {currentImage ? (
              <img
                src={currentImage}
                alt={product.name}
                style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ color: "#94a3b8", fontSize: "14px" }}>Sin imagen disponible</div>
            )}
          </div>

          <div className="stack-xxs">
            <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", lineHeight: "1.3" }}>
              {product.name}
              {selectedVariant ? ` (${selectedVariant.name})` : ""}
            </h1>
            
            {product.digitalProfile.descriptionShort && (
              <p style={{ fontSize: "14px", color: "#475569", fontStyle: "italic", margin: "6px 0 0" }}>
                "{product.digitalProfile.descriptionShort}"
              </p>
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              <span style={{ background: "#f1f5f9", fontSize: "12px", padding: "4px 8px", borderRadius: "6px", color: "#475569", fontWeight: "500" }}>
                SKU: {currentSku}
              </span>
              <span style={{ background: "#fffbeb", fontSize: "12px", padding: "4px 8px", borderRadius: "6px", color: "#b45309", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                <Star size={14} fill="#b45309" />
                4.9 (Valoración de tienda)
              </span>
            </div>
          </div>
        </section>

        {/* Dynamic Price Tiers */}
        <section className="panel stack-sm" style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Precios y Escalas</h2>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #f1f5f9" }}>
              <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 4px" }}>Por Unidad</p>
              <p style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                {formatCurrency(product.unitPrice)}
              </p>
            </div>

            {product.wholesalePrice && (
              <div style={{ background: "#f0fdf4", padding: "12px", borderRadius: "10px", border: "1px solid #dcfce7" }}>
                <p style={{ fontSize: "11px", color: "#16a34a", fontWeight: "600", margin: "0 0 4px" }}>
                  Al Mayor (Min {product.wholesaleMinQty})
                </p>
                <p style={{ fontSize: "20px", fontWeight: "800", color: "#16a34a", margin: 0 }}>
                  {formatCurrency(product.wholesalePrice)}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Color / Variant Selector */}
        {product.variants.length > 0 && (
          <section className="panel stack-sm" style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Colores Disponibles</h2>
            <div style={{ display: "flex", gap: "12px", marginTop: "4px", overflowX: "auto", paddingBottom: "4px" }}>
              {product.variants.map((v, idx) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantIndex(idx)}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: v.hexColor || "#2320DA",
                    border: selectedVariantIndex === idx ? "3px solid #0f172a" : "1px solid #cbd5e1",
                    outline: selectedVariantIndex === idx ? "2px solid white" : "none",
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0
                  }}
                  title={v.name}
                />
              ))}
            </div>
            <p style={{ fontSize: "13px", color: "#334155", margin: 0 }}>
              Color Seleccionado: <span style={{ fontWeight: "700" }}>{selectedVariant?.name}</span>
            </p>
          </section>
        )}

        {/* Product Full Description */}
        {product.digitalProfile.descriptionFull && (
          <section className="panel" style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>Descripción del Producto</h2>
            <div
              style={{ fontSize: "14px", lineHeight: "1.6", color: "#334155" }}
              dangerouslySetInnerHTML={{ __html: product.digitalProfile.descriptionFull.replace(/\n/g, "<br/>") }}
            />
          </section>
        )}

        {/* Technical Specs Accordion */}
        {product.specifications.length > 0 && (
          <section className="panel" style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: 0, overflow: "hidden" }}>
            <button
              onClick={() => setIsSpecsOpen(!isSpecsOpen)}
              style={{ width: "100%", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "14px", color: "#0f172a" }}
            >
              <span>Especificaciones Técnicas</span>
              <ChevronDown size={20} style={{ transform: isSpecsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {isSpecsOpen && (
              <div style={{ padding: "0 16px 16px" }} className="stack-xs">
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px" }} className="stack-xxs">
                  {product.specifications.map((spec) => (
                    <div key={spec.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px", fontSize: "13px" }}>
                      <span style={{ color: "#64748b" }}>{spec.name}</span>
                      <span style={{ fontWeight: "600", color: "#0f172a" }}>{spec.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Videos Carousel */}
        {product.videos.length > 0 && (
          <section className="panel stack-sm" style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Guías y Videos de Uso</h2>
            <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "4px" }}>
              {product.videos.map((vid) => (
                <div
                  key={vid.id}
                  onClick={() => handlePlayVideo(vid.videoId)}
                  style={{ flexShrink: 0, width: "160px", cursor: "pointer" }}
                  className="stack-xxs"
                >
                  <div style={{ width: "160px", height: "96px", background: "#e2e8f0", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
                    {vid.thumbnailUrl ? (
                      <img src={vid.thumbnailUrl} alt={vid.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#475569" }} />
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Play size={18} fill="#2320DA" stroke="none" style={{ marginLeft: "2px" }} />
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: "12px", fontWeight: "600", color: "#1e293b", margin: "4px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", height: "34px", lineHeight: "1.4" }}>
                    {vid.title || "Video demostrativo"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Documents */}
        {product.documents.length > 0 && (
          <section className="panel stack-sm" style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Manuales e Instructivos</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {product.documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleOpenDoc(doc.url)}
                  style={{ background: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}
                >
                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText size={20} style={{ color: "#ef4444" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {doc.title}
                    </p>
                    <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>Descarga directa PDF</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* Sticky Bottom Action Bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #e2e8f0", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 90, boxShadow: "0 -4px 6px -1px rgb(0 0 0 / 0.05)" }}>
        
        {/* Quantity selector */}
        <div style={{ display: "flex", alignItems: "center", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#f8fafc", padding: "2px" }}>
          <button
            onClick={decrementQty}
            style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", color: "#475569" }}
          >
            <Minus size={14} />
          </button>
          <span style={{ width: "32px", textAlign: "center", fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>
            {quantity}
          </span>
          <button
            onClick={incrementQty}
            style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", color: "#475569" }}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          style={{ flex: 1, marginLeft: "12px", background: "#2320DA", color: "white", border: "none", height: "40px", borderRadius: "8px", fontSize: "14px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
        >
          <ShoppingCart size={18} />
          Agregar
          <span style={{ opacity: 0.8, fontWeight: "normal" }}>|</span>
          {formatCurrency(effectivePrice * quantity)}
        </button>
      </div>

      {/* Emitted YouTube Video Player Modal */}
      {activeVideoId && (
        <div
          onClick={() => setActiveVideoId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "640px", aspectRatio: "16/9", background: "black", borderRadius: "12px", overflow: "hidden", position: "relative", margin: "16px" }}
          >
            <iframe
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      )}

      {/* Cart Drawer & Sidebar Actions */}
      <StoreSideActions settings={settings} />
      <CartDrawer settings={settings} quoteDefaults={quoteDefaults} />
    </div>
  );
}
