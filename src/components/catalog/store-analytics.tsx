"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { ANALYTICS_CONSENT_KEY, isTrackedStorePath, prepareClarity } from "@/lib/clarity";
import styles from "./store-analytics.module.css";
import { clearStoreAnalyticsSession, trackStoreEvent } from "@/lib/store-analytics-client";

const CHANGE_EVENT = "store-analytics-consent-change";
let memoryConsent: string | null = null;
let trackerLoaded = false;

function readConsent() {
  try { return localStorage.getItem(ANALYTICS_CONSENT_KEY); }
  catch { return memoryConsent; }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function StoreAnalytics({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribe, readConsent, () => null);
  const [editing, setEditing] = useState(false);
  const allowed = isTrackedStorePath(pathname);
  const enabled = allowed && consent === "accepted";

  useLayoutEffect(() => {
    if (!enabled) {
      window.storeAnalyticsActive = false;
      if (window.clarity) {
        if (consent !== "accepted") {
          window.clarity("consentv2", { analytics_Storage: "denied", ad_Storage: "denied" });
        }
        window.clarity("stop");
      }
      return;
    }
    if (projectId) prepareClarity();
    // Loaded trackers resume when returning from an excluded route.
    if (trackerLoaded) window.clarity?.("start");
    window.clarity?.("consentv2", { analytics_Storage: "granted", ad_Storage: "denied" });
    window.storeAnalyticsActive = true;
    trackStoreEvent("page_view");
    function onClick(event: MouseEvent) {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (anchor && ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(new URL(anchor.href, location.href).hostname)) trackStoreEvent("whatsapp_click");
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      window.storeAnalyticsActive = false;
      window.clarity?.("stop");
    };
  }, [enabled, consent, pathname, projectId]);

  function choose(value: "accepted" | "rejected") {
    memoryConsent = value;
    if (value === "rejected") clearStoreAnalyticsSession();
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, value); } catch { /* Keep the choice for this page. */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setEditing(false);
  }

  if (!allowed) return null;

  return (
    <>
      {enabled && projectId && (
        <Script
          id="store-microsoft-clarity"
          src={`https://www.clarity.ms/tag/${projectId}`}
          strategy="afterInteractive"
          onReady={() => {
            trackerLoaded = true;
            // The visitor can reject or leave the store while the script downloads.
            if (readConsent() !== "accepted" || !isTrackedStorePath(window.location.pathname)) {
              window.storeAnalyticsActive = false;
              window.clarity?.("stop");
            } else {
              window.clarity?.("start");
              window.clarity?.("consentv2", { analytics_Storage: "granted", ad_Storage: "denied" });
              window.storeAnalyticsActive = true;
            }
          }}
        />
      )}
      {(!consent || editing) ? (
        <section className={styles.banner} aria-label="Preferencias de analítica">
          <strong>Ayúdanos a mejorar la tienda</strong>
          <p>Con tu permiso, medimos visitas, búsquedas y acciones del carrito para mejorar la tienda.
            {projectId ? " Microsoft Clarity también registra clics y navegación ocultando el texto de la página." : ""}</p>
          <a href="/politica-de-privacidad">Política de privacidad</a>
          <div className={styles.actions}>
            <button type="button" onClick={() => choose("rejected")}>Rechazar</button>
            <button type="button" onClick={() => choose("accepted")}>Aceptar analítica</button>
          </div>
        </section>
      ) : (
        <button className={styles.preferences} type="button" onClick={() => setEditing(true)}>
          Privacidad y cookies
        </button>
      )}
    </>
  );
}
