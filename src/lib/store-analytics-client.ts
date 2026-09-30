import { ANALYTICS_CONSENT_KEY, isTrackedStorePath } from "./clarity";
import { cleanSearchTerm, trafficSource, type StoreEventName } from "./store-analytics-contract";

const key = "store-analytics-session-v1";
type Session = { id: string; touched: number; source: ReturnType<typeof trafficSource> };
let fallback: Session | undefined;
let lastView = "";
export function clearStoreAnalyticsSession() {
  fallback = undefined; lastView = "";
  try { sessionStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
}
export function storeAnalyticsAllowed() {
  if (typeof window === "undefined" || !window.storeAnalyticsActive || !isTrackedStorePath(window.location.pathname)) return false;
  try { return localStorage.getItem(ANALYTICS_CONSENT_KEY) === "accepted"; } catch { return window.storeAnalyticsActive === true; }
}
export function trackStoreEvent(name: StoreEventName, details: { productCode?: string; searchTerm?: string; resultCount?: number; quoteId?: string } = {}) {
  if (!storeAnalyticsAllowed()) return;
  try {
    const now = Date.now();
    let session = fallback;
    try { session = JSON.parse(sessionStorage.getItem(key) || "null") || session; } catch { /* Use in-memory session. */ }
    if (session && (!/^[0-9a-f-]{36}$/i.test(session.id) || !Number.isFinite(session.touched) || !["direct", "google", "tiktok", "facebook", "instagram", "whatsapp", "other"].includes(session.source))) session = undefined;
    const fresh = !session || now - session.touched > 30 * 60 * 1000;
    if (fresh) session = { id: crypto.randomUUID(), touched: now, source: trafficSource(document.referrer, new URL(window.location.href).searchParams.get("utm_source") || "", window.location.origin) };
    session!.touched = now; fallback = session;
    try { sessionStorage.setItem(key, JSON.stringify(session)); } catch { /* Keep consented session in memory. */ }
    const path = window.location.pathname;
    const page = path === "/" ? "home" : path.startsWith("/producto/") ? "product" : path.startsWith("/categoria/") ? "category" : "sheet";
    if (name === "page_view") {
      const view = `${session!.id}:${path}`;
      if (lastView === view) return;
      lastView = view;
    }
    const event = { id: crypto.randomUUID(), name, page, ...details, ...(details.searchTerm ? { searchTerm: cleanSearchTerm(details.searchTerm) } : {}) };
    const events = fresh && name !== "page_view" ? [{ id: crypto.randomUUID(), name: "page_view", page }, event] : [event];
    if (fresh) lastView = `${session!.id}:${path}`;
    void fetch("/api/store-analytics", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ consent: true, sessionId: session!.id, source: session!.source, device: window.innerWidth < 768 ? "mobile" : "desktop", events }) }).catch(() => {});
  } catch { /* Analytics never interrupts navigation, search or checkout. */ }
}
