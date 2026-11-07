export type QuoteHandoffRecord = {
  id: string;
  status: string;
  quoteNumber: string | null;
  erpExternalId: string | null;
  contactHref: string | null;
  statusSteps: unknown;
};

export type QuoteMessengerHandoff = {
  localQuoteId: string;
  quoteNumber?: string;
  message: string;
  messengerHref: string;
  reused: boolean;
  statusSteps: unknown;
};

/**
 * An idempotency key identifies the customer's request, not a failed action.
 * Every existing request gets the same safe Messenger handoff; only a fully
 * registered ERP quote changes the confirmation wording.
 */
export function buildQuoteMessengerHandoff(
  quote: QuoteHandoffRecord,
  messengerHref: string,
): QuoteMessengerHandoff {
  if (quote.status === "ERP_REGISTERED" && quote.quoteNumber && quote.erpExternalId) {
    return {
      localQuoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      message: `Cotización ${quote.quoteNumber} registrada en el ERP. Abriremos Messenger para continuar con un asesor.`,
      messengerHref,
      reused: true,
      statusSteps: quote.statusSteps,
    };
  }

  const reference = quote.quoteNumber ?? quote.id;
  return {
    localQuoteId: quote.id,
    ...(quote.quoteNumber ? { quoteNumber: quote.quoteNumber } : {}),
    message: `La solicitud ${reference} ya fue recibida y sigue pendiente de confirmación. Abriremos Messenger para continuar con un asesor; no se duplicará el pedido.`,
    messengerHref,
    reused: true,
    statusSteps: quote.statusSteps ?? [{ status: "warning", text: "Solicitud recibida; pendiente de confirmación por un asesor." }],
  };
}
