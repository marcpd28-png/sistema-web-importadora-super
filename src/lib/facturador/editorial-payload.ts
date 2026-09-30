export type EditorialContent = {
  descriptionShort: string | null;
  descriptionFull: string | null;
  specifications: Array<{ name: string; value: string }>;
};

export class EditorialWriteError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

export function escapeEditorialHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

export function buildEditorialFields(content: EditorialContent) {
  const short = content.descriptionShort?.trim() || "";
  const full = content.descriptionFull?.trim() || "";
  if (short.length > 500 || full.length > 20000 || content.specifications.length > 100) {
    throw new EditorialWriteError("CONTENT_TOO_LONG", "La ficha supera el tamaño permitido para enviar al ERP.");
  }
  const specs = content.specifications.filter((s) => s.name.trim() && s.value.trim());
  if (specs.some((s) => s.name.length > 120 || s.value.length > 1000)) {
    throw new EditorialWriteError("CONTENT_TOO_LONG", "Una especificación supera el tamaño permitido.");
  }
  if (!short && !full && !specs.length) {
    throw new EditorialWriteError("EMPTY_CONTENT", "Escribe una descripción o especificaciones antes de enviar al ERP.");
  }
  const paragraphs = [short, full === short ? "" : full].filter(Boolean)
    .map((text) => `<p>${escapeEditorialHtml(text).replace(/\r?\n/g, "<br>")}</p>`).join("");
  const table = specs.length
    ? `<h3>Especificaciones técnicas</h3><table><tbody>${specs.map((s) =>
      `<tr><th>${escapeEditorialHtml(s.name.trim())}</th><td>${escapeEditorialHtml(s.value.trim())}</td></tr>`).join("")}</tbody></table>`
    : "";
  // factory_code is a short search aid, not the canonical full technical sheet.
  // Every complete value is retained in name_long even if the summary is short.
  const summary = specs.map((s) => `${s.name.trim()}: ${s.value.trim()}`).join(" | ");
  return {
    name_long: paragraphs + table,
    ...(summary ? { factory_code: Array.from(summary).slice(0, 250).join("") } : {}),
  };
}

export function extractErpRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || (payload as { success?: boolean }).success === false) {
    throw new EditorialWriteError("ERP_READ_FAILED", "El ERP no devolvió el producto. Intenta más tarde.", 502);
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new EditorialWriteError("ERP_READ_FAILED", "El ERP devolvió un registro incompleto.", 502);
  }
  return data as Record<string, unknown>;
}

export function buildErpEditorialPayload(
  record: Record<string, unknown>,
  identity: { externalId: string; code: string },
  content: EditorialContent,
): Record<string, unknown> & ReturnType<typeof buildEditorialFields> {
  return { ...buildErpProductBasePayload(record, identity), ...buildEditorialFields(content) };
}

// Shared by both editors: the ERP resets omitted image references.
export function buildErpProductBasePayload(
  record: Record<string, unknown>,
  identity: { externalId: string; code: string },
): Record<string, unknown> {
  if (!/^\d+$/.test(identity.externalId) || String(record.id) !== identity.externalId || record.internal_id !== identity.code) {
    throw new EditorialWriteError("IDENTITY_MISMATCH", "El código del producto no coincide con el ERP. Revisa su vinculación.", 409);
  }
  const required = ["description", "unit_type_id", "currency_type_id", "sale_unit_price", "purchase_unit_price",
    "sale_affectation_igv_type_id", "purchase_affectation_igv_type_id", "has_igv"];
  for (const key of required) {
    if (record[key] === null || record[key] === undefined || record[key] === "") {
      throw new EditorialWriteError("INCOMPLETE_RECORD", `El ERP no devolvió ${key}; no se enviaron cambios.`, 502);
    }
  }
  if (typeof record.description !== "string" || typeof record.has_igv !== "boolean" ||
      [record.sale_unit_price, record.purchase_unit_price].some((v) =>
        !["number", "string"].includes(typeof v) || !Number.isFinite(Number(v)) || Number(v) < 0)) {
    throw new EditorialWriteError("INCOMPLETE_RECORD", "Los datos comerciales del ERP no son válidos.", 502);
  }
  let imageUrl: URL;
  try { imageUrl = new URL(String(record.image_url)); } catch {
    throw new EditorialWriteError("IMAGE_UNAVAILABLE", "No se pudo identificar la imagen original del ERP. No se enviaron cambios.", 502);
  }
  // The ERP replaces omitted images with its placeholder. Always preserve its
  // own stored filename. Refuse external/CDN schemas whose semantics are unknown.
  const path = decodeURIComponent(imageUrl.pathname);
  if (!["https:", "http:"].includes(imageUrl.protocol) ||
      !/^\/(storage\/uploads\/items\/|logo\/)[^/\\]+$/.test(path)) {
    throw new EditorialWriteError("IMAGE_UNAVAILABLE", "El formato de imagen del ERP requiere revisión antes de enviar.", 502);
  }
  const image = path.split("/").pop()!;
  const body: Record<string, unknown> = { id: record.id };
  // Only resubmit known original scalar values; never use stale local prices,
  // guessed defaults, stock, or relation arrays in an editorial write.
  for (const key of [...required, "internal_id", "item_code", "name", "second_name", "barcode",
    "has_isc", "system_isc_type_id", "percentage_isc", "calculate_quantity", "has_perception",
    "percentage_perception", "percentage_of_profit", "category_id", "brand_id"]) {
    if (key in record) body[key] = record[key];
  }
  return { ...body, image, image_url: record.image_url, temp_path: null };
}
