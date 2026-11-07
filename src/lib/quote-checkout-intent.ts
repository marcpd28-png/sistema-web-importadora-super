export const quoteDeliveryTypes = ["DELIVERY", "PICKUP", "PROVINCE"] as const;
export type QuoteDeliveryType = (typeof quoteDeliveryTypes)[number];

export function validateQuoteFulfillment(deliveryType: string, address: string | null) {
  if (!quoteDeliveryTypes.includes(deliveryType as QuoteDeliveryType)) {
    return "Selecciona cómo recibirás tu pedido.";
  }
  if (deliveryType !== "PICKUP" && !address?.trim()) {
    return "Ingresa la dirección o ciudad de entrega.";
  }
  return null;
}
