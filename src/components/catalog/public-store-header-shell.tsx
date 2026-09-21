"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type PublicStoreHeaderState = {
  collapsed: boolean;
};

type PublicStoreHeaderShellProps = {
  children: ReactNode;
};

const PublicStoreHeaderStateContext = createContext<PublicStoreHeaderState | null>(null);

export function usePublicStoreHeaderState() {
  const state = useContext(PublicStoreHeaderStateContext);

  if (!state) {
    throw new Error("usePublicStoreHeaderState must be used within PublicStoreHeaderShell");
  }

  return state;
}

export function PublicStoreHeaderShell({ children }: PublicStoreHeaderShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [shortcutsHidden, setShortcutsHidden] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 920px)");
    let previousY = Math.max(0, window.scrollY);

    const updateCollapsedState = () => {
      setCollapsed(!media.matches && window.scrollY > 18);
    };

    const updateScrollState = () => {
      updateCollapsedState();
      const currentY = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
      if (!media.matches || currentY <= 24) {
        setShortcutsHidden(false);
        previousY = currentY;
      } else if (Math.abs(currentY - previousY) >= 8) {
        setShortcutsHidden(currentY > previousY && currentY > 80);
        previousY = currentY;
      }
    };

    const resetScrollState = () => {
      updateCollapsedState();
      setShortcutsHidden(false);
      previousY = Math.max(0, window.scrollY);
    };

    updateCollapsedState();

    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", resetScrollState);
    media.addEventListener("change", resetScrollState);

    return () => {
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", resetScrollState);
      media.removeEventListener("change", resetScrollState);
    };
  }, []);

  const value = useMemo(() => ({ collapsed }), [collapsed]);

  return (
    <PublicStoreHeaderStateContext.Provider value={value}>
      <div className={`public-store-header-shell${collapsed ? " is-collapsed" : ""}${shortcutsHidden ? " shortcuts-hidden" : ""}`}>
        {children}
      </div>
    </PublicStoreHeaderStateContext.Provider>
  );
}
