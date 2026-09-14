function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type RouterV2PaymentMethod =
  | "YAPE"
  | "PLIN"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "EFECTIVO";

function methodFromText(text: string): RouterV2PaymentMethod | null {
  if (/\byape\b/.test(text)) return "YAPE";
  if (/\bplin\b/.test(text)) return "PLIN";
  if (/\b(interbank|transferencia|transferir|deposito)\b/.test(text)) {
    return "TRANSFERENCIA";
  }
  if (/\b(tarjeta|culqi|visa|mastercard)\b/.test(text)) return "TARJETA";
  if (/\befectivo\b/.test(text)) return "EFECTIVO";
  return null;
}

export function resolveRouterV2PaymentSelection(input: {
  content: string;
  stage?: string | null;
}): RouterV2PaymentMethod | null {
  const text = normalize(input.content);
  const method = methodFromText(text);
  if (!method) return null;

  const exactChoice =
    /^(yape|plin|interbank|transferencia|deposito|tarjeta|culqi|visa|mastercard|efectivo)(?:\s+por favor)?[.!]?$/.test(
      text,
    );

  const explicitChoice =
    /\b(quiero|deseo|prefiero|elijo|voy a|pagare|pagaré)\b.*\b(yape|plin|interbank|transferencia|deposito|tarjeta|culqi|visa|mastercard|efectivo)\b/.test(
      text,
    ) ||
    /\b(pago|pagar)\s+(?:con|por|mediante)\s+(yape|plin|interbank|transferencia|deposito|tarjeta|culqi|visa|mastercard|efectivo)\b/.test(
      text,
    );

  const contextualChoice =
    input.stage === "AWAITING_PAYMENT_METHOD" && exactChoice;

  return explicitChoice || contextualChoice ? method : null;
}
