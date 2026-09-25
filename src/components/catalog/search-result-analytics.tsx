"use client";
import { useEffect } from "react";
import { storeAnalyticsAllowed, trackStoreEvent } from "@/lib/store-analytics-client";
import { analyticsConsentEvent } from "@/lib/store-analytics-contract";
export function SearchResultAnalytics({ query, resultCount }: { query: string; resultCount: number }) {
  useEffect(() => {
    let sent = false;
    const send = () => { if (!sent && query && storeAnalyticsAllowed()) { sent = true; trackStoreEvent("search_results", { searchTerm: query, resultCount }); } };
    const later = () => { window.setTimeout(send, 0); };
    later(); window.addEventListener(analyticsConsentEvent, later);
    return () => window.removeEventListener(analyticsConsentEvent, later);
  }, [query, resultCount]);
  return null;
}
