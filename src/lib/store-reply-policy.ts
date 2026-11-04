import type { ShopAssistantReply } from "./shop-assistant-types";
import { PUBLIC_MESSENGER_URL } from "./utils";

export function finalizeStoreReply(reply: ShopAssistantReply, messengerUrl = PUBLIC_MESSENGER_URL): ShopAssistantReply {
  const products = reply.products?.filter(product => product.stockUnits > 0 && Number.isFinite(product.unitPriceValue) && product.unitPriceValue > 0);
  if (!reply.text.trim() || /no (?:pude|encontr[eé])/i.test(reply.text) || (reply.products?.length && !products?.length)) {
    return { text: "No ubico el producto. ¿Tienes foto, código o modelo?", quickActions: [{ label: "Hablar con un asesor", href: messengerUrl, accent: true }], meta: { intent: "human-assistance", usedOllama: false } };
  }
  return { ...reply, products, meta: { ...reply.meta, usedOllama: reply.meta?.usedOllama ?? false } };
}
