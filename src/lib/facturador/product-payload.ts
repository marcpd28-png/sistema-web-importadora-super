import { createHash } from "node:crypto";
import { buildErpProductBasePayload, EditorialWriteError, escapeEditorialHtml } from "./editorial-payload";
import { erpProductFields, erpProductSendSchema, type ErpProductOperation, type ErpProductSnapshot } from "./product-fields";

export function productRevision(record: Record<string, unknown>) {
  const keys = [...new Set(["id", "image_url", "stock", "warehouses", ...erpProductFields.map((f) => f.key)])].sort();
  return createHash("sha256").update(JSON.stringify(keys.map((key) => [key, record[key] ?? null]))).digest("hex");
}

export function productSnapshot(record: Record<string, unknown>, tables: unknown): ErpProductSnapshot {
  const values: ErpProductSnapshot["values"] = {};
  for (const key of [...erpProductFields.map((f) => f.key), "image_url"]) {
    const value = record[key];
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) values[key] = value as string | number | boolean | null;
  }
  const source = tables && typeof tables === "object" ? tables as Record<string, unknown> : {};
  const nested = source.data && typeof source.data === "object" ? source.data as Record<string, unknown> : source;
  const options: ErpProductSnapshot["tables"] = {};
  for (const key of ["unit_types", "currency_types", "categories", "brands", "affectation_igv_types", "system_isc_types", "warehouses"]) {
    if (!Array.isArray(nested[key])) continue;
    options[key] = (nested[key] as Record<string, unknown>[]).filter((r) => r && ["number", "string"].includes(typeof r.id))
      .map((r) => ({ id: String(r.id), label: String(r.description ?? r.name ?? r.id) }));
  }
  return { revision: productRevision(record), values, tables: options,
    stock: ["string", "number"].includes(typeof record.stock) ? String(record.stock) : null };
}

export function buildProductWrite(record: Record<string, unknown>, identity: { externalId: string; code: string }, raw: ErpProductOperation): { path: string; body: Record<string, unknown> } {
  const input = erpProductSendSchema.parse(raw);
  if (!/^\d+$/.test(identity.externalId) || String(record.id) !== identity.externalId || record.internal_id !== identity.code) {
    throw new EditorialWriteError("IDENTITY_MISMATCH", "El producto cambió de código en el ERP. Sincroniza antes de editar.", 409);
  }
  if (input.kind === "inventory") {
    return { path: "/inventory/transaction", body: {
      type: input.type, inventory_transaction_id: input.type === "input" ? "03" : "01",
      item_code: record.internal_id, quantity: input.quantity, warehouse_id: input.warehouseId,
    } };
  }
  const body: Record<string, unknown> = { ...buildErpProductBasePayload(record, identity), ...input.changes };
  if (input.changes.name_long !== undefined) {
    body.name_long = `<p>${escapeEditorialHtml(input.changes.name_long).replace(/\r?\n/g, "<br>")}</p>`;
  }
  if (input.changes.image_url !== undefined) {
    const original = new URL(String(record.image_url));
    const image = new URL(input.changes.image_url);
    if (image.origin !== original.origin || image.username || image.password || image.search || image.hash ||
        !/^\/storage\/uploads\/items\/[\w.-]+\.(jpg|jpeg|png|webp|gif)$/i.test(image.pathname)) {
      throw new EditorialWriteError("IMAGE_FORMAT", "Usa la URL de una imagen ya cargada en este ERP. Su API no documenta la subida de archivos nuevos.");
    }
    body.image = image.pathname.split("/").pop()!;
    body.temp_path = null;
  }
  return { path: "/items/update", body };
}

// Only fields actually returned by the API can be verified. Missing editorial
// fields remain explicitly unverified, even after success:true.
export function verifyProductChanges(record: Record<string, unknown>, changes: Record<string, unknown>) {
  const verified: string[] = [], unverified: string[] = [], mismatched: string[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (!(key in record)) { unverified.push(key); continue; }
    const actual = record[key];
    const equal = typeof value === "number" ? actual !== null && actual !== "" && Number(actual) === value
      : typeof value === "boolean" ? actual === value || actual === Number(value)
      : value === null ? actual === null || actual === "" : String(actual ?? "") === String(value);
    (equal ? verified : mismatched).push(key);
  }
  return { verified, unverified, mismatched };
}
