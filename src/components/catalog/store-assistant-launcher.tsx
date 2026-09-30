"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import type { StoreAssistantPanelProps } from "@/components/catalog/store-assistant";
import {
  STORE_ASSISTANT_OPEN_EVENT,
  type StoreAssistantOpenDetail,
} from "@/components/catalog/assistant-events";

const StoreAssistantPanel = dynamic<StoreAssistantPanelProps>(
  () =>
    import("@/components/catalog/store-assistant").then(
      (module) => module.StoreAssistantPanel,
    ),
  {
    ssr: false,
  },
);

type StoreAssistantLauncherProps = {
  businessName: string;
};

export function StoreAssistantLauncher({ businessName }: StoreAssistantLauncherProps) {
  const [open, setOpen] = useState(false);
  const [shouldLoadPanel, setShouldLoadPanel] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<StoreAssistantOpenDetail | null>(null);

  const preloadPanel = () => {
    setShouldLoadPanel(true);
    void import("@/components/catalog/store-assistant");
  };

  const openAssistant = () => {
    preloadPanel();
    setOpen(true);
  };

  useEffect(() => {
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => {
            void import("@/components/catalog/store-assistant");
          })
        : window.setTimeout(() => {
            void import("@/components/catalog/store-assistant");
          }, 700);

    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<StoreAssistantOpenDetail>).detail;
      if (!detail?.prompt) {
        return;
      }

      preloadPanel();
      setPendingRequest(detail);
      setOpen(true);
    };

    window.addEventListener(STORE_ASSISTANT_OPEN_EVENT, handleOpen);
    return () => {
      if (typeof window.requestIdleCallback === "function") {
        window.cancelIdleCallback(idleId as number);
      } else {
        window.clearTimeout(idleId as number);
      }

      window.removeEventListener(STORE_ASSISTANT_OPEN_EVENT, handleOpen);
    };
  }, []);

  return (
    <>
      <button
        aria-label="Abrir asistente virtual"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Recibir ayuda para comprar"
        className="store-side-action store-side-action-assistant"
        onClick={openAssistant}
        onFocus={preloadPanel}
        onMouseEnter={preloadPanel}
        onTouchStart={preloadPanel}
        type="button"
      >
        <Bot size={18} />
        <span>Asistente</span>
      </button>

      {shouldLoadPanel ? (
        <StoreAssistantPanel
          businessName={businessName}
          initialCategorySlug={pendingRequest?.contextCategorySlug ?? null}
          initialPrompt={pendingRequest?.prompt ?? null}
          initialProductCode={pendingRequest?.productContextCode ?? null}
          onInitialPromptHandled={() => setPendingRequest(null)}
          onClose={() => setOpen(false)}
          open={open}
        />
      ) : null}
    </>
  );
}
