import type { ShopAssistantReply } from "./shop-assistant-types";

export function finalizeStoreReply(reply: ShopAssistantReply, advisorUrl: string): ShopAssistantReply {
  const products = reply.products?.filter(product => product.stockUnits > 0 && Number.isFinite(product.unitPriceValue) && product.unitPriceValue > 0);
  if (!reply.text.trim() || /no (?:pude|encontr[eé])/i.test(reply.text) || (reply.products?.length && !products?.length)) {
    return { text: "Un asesor puede ayudarte a confirmar el producto y su precio. Escríbenos por WhatsApp para continuar con tu consulta.", quickActions: [{ label: "Hablar con un asesor", href: advisorUrl, accent: true }], meta: { intent: "human-assistance", usedOllama: false } };
  }
  return { ...reply, products, quickActions: reply.quickActions?.filter(action => !action.href.startsWith("/?")), meta: { ...reply.meta, usedOllama: reply.meta?.usedOllama ?? false } };
}
