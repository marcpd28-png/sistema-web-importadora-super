export function messageStatusLabel(status: string | null, metadata: unknown) {
  const meta = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const receipt = meta.deliveryReceipt && typeof meta.deliveryReceipt === "object" ? meta.deliveryReceipt as Record<string, unknown> : {};
  if (status === "read") return "Leído";
  if (status === "delivered") return "Entregado";
  if (status === "failed" && receipt.status === "failed") return `No entregado${receipt.errorCode ? ` (código ${String(receipt.errorCode)})` : ""}.`;
  if (meta.manychatImageFlowAck) return "Flujo procesado; entrega no confirmada.";
  if (meta.manychatImageDispatch === "uncertain" || status === "uncertain") return "Sin confirmar. Requiere revisión; no se reenviará automáticamente.";
  if (status === "queued" || status === "bc_queued") return "En cola";
  if (status === "cancelled") return "Cancelado antes de enviar";
  if (status === "sent") return receipt.status === "sent" ? "Enviado; entrega pendiente." : "Aceptado; entrega no confirmada.";
  if (status === "pending" || status === "sending" || status === "bc_sending") return "Enviando...";
  if (status === "unknown") return "Estado de entrega desconocido";
  return null;
}
