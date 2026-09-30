export const ANALYTICS_CONSENT_KEY = "store-analytics-consent-v1";

export function getClarityProjectId(value: string | undefined) {
  const id = value?.trim() ?? "";
  return /^[a-z0-9]+$/i.test(id) ? id : "";
}

export function isTrackedStorePath(pathname: string) {
  return pathname === "/" || /^\/(producto|categoria|p)\/[^/]+\/?$/.test(pathname);
}

type ClarityCommand = [command: string, ...args: unknown[]];
type Clarity = ((...args: ClarityCommand) => void) & { q?: ClarityCommand[] };

declare global {
  interface Window {
    clarity?: Clarity;
    storeAnalyticsActive?: boolean;
  }
}

export function prepareClarity() {
  if (!window.clarity) {
    const queue: Clarity = (...args) => { queue.q!.push(args); };
    queue.q = [];
    window.clarity = queue;
  }
}

export function trackClarityEvent(name: string) {
  if (typeof window === "undefined" || !window.storeAnalyticsActive ||
      !isTrackedStorePath(window.location.pathname)) return;
  // Only fixed event names are sent, never search text or customer/order details.
  try { window.clarity?.("event", name); } catch { /* Analytics must not interrupt a purchase. */ }
}
