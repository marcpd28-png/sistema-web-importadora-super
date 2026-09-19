export class QuotationUnconfirmedError extends Error {}

export function confirmQuotationResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new QuotationUnconfirmedError("El ERP no confirmó el registro de la cotización. Consulta con un asesor antes de repetirla.");
  const root = payload as Record<string, unknown>;
  if (root.success === false) throw new QuotationUnconfirmedError("El ERP rechazó o no confirmó la cotización. Consulta con un asesor antes de repetirla.");
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const quoteNumber = text(data.number_full) || text(data.identifier) || text(data.number);
  const externalId = text(data.external_id) || text(data.externalId);
  if (!quoteNumber || !externalId) throw new QuotationUnconfirmedError("El ERP no devolvió el número y la referencia de la cotización. No se puede confirmar su registro; consulta con un asesor antes de repetirla.");
  return { quoteNumber, externalId };
}
