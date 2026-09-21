import { z } from "zod";

// The regular /items/update contract in the owner's Postman collection.
// Mobile-only fields (lots, packs, stock) are deliberately not mixed into it.
export const erpProductFields = [
  { key: "internal_id", label: "Código interno", type: "text", required: true },
  { key: "description", label: "Nombre", type: "text", required: true },
  { key: "name", label: "Descripción breve", type: "textarea" },
  { key: "second_name", label: "Nombre secundario", type: "text" },
  { key: "item_code", label: "Código SUNAT", type: "text" },
  { key: "barcode", label: "Código de barras", type: "text" },
  { key: "unit_type_id", label: "Unidad de medida", type: "text", table: "unit_types", required: true },
  { key: "currency_type_id", label: "Moneda", type: "text", table: "currency_types", required: true },
  { key: "sale_unit_price", label: "Precio de venta", type: "number", required: true },
  { key: "purchase_unit_price", label: "Precio de compra", type: "number", required: true },
  { key: "category_id", label: "Categoría ERP", type: "text", table: "categories" },
  { key: "brand_id", label: "Marca ERP", type: "text", table: "brands" },
  { key: "sale_affectation_igv_type_id", label: "Afectación IGV de venta", type: "text", table: "affectation_igv_types", required: true },
  { key: "purchase_affectation_igv_type_id", label: "Afectación IGV de compra", type: "text", table: "affectation_igv_types", required: true },
  { key: "has_igv", label: "Precio incluye IGV", type: "boolean" },
  { key: "has_isc", label: "Aplica ISC", type: "boolean" },
  { key: "system_isc_type_id", label: "Sistema ISC", type: "text", table: "system_isc_types" },
  { key: "percentage_isc", label: "Porcentaje ISC", type: "number" },
  { key: "has_perception", label: "Aplica percepción", type: "boolean" },
  { key: "percentage_perception", label: "Porcentaje de percepción", type: "number" },
  { key: "percentage_of_profit", label: "Porcentaje de ganancia", type: "number" },
  { key: "calculate_quantity", label: "Calcular cantidad", type: "boolean" },
  { key: "name_long", label: "Descripción detallada (texto)", type: "textarea" },
  { key: "factory_code", label: "Especificaciones (máximo 250 caracteres)", type: "textarea" },
] as const;

const optionalText = z.string().max(500).nullable();
const amount = z.union([z.number(), z.string().trim().min(1)]).transform(Number)
  .pipe(z.number().finite().min(0).max(1_000_000_000));
const reference = z.union([z.string().trim().regex(/^[\w.-]{1,40}$/), z.number().int().positive()]).nullable();
export const erpProductChangesSchema = z.object({
  internal_id: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(500),
  name: optionalText, second_name: optionalText, item_code: optionalText, barcode: optionalText,
  unit_type_id: z.string().trim().min(1).max(20), currency_type_id: z.string().trim().min(1).max(10),
  sale_unit_price: amount, purchase_unit_price: amount,
  category_id: reference, brand_id: reference,
  sale_affectation_igv_type_id: z.string().regex(/^\d{2}$/), purchase_affectation_igv_type_id: z.string().regex(/^\d{2}$/),
  has_igv: z.boolean(), has_isc: z.boolean(), system_isc_type_id: reference,
  percentage_isc: amount.pipe(z.number().max(100)), percentage_perception: amount.pipe(z.number().max(100)),
  percentage_of_profit: amount, has_perception: z.boolean(), calculate_quantity: z.boolean(),
  name_long: z.string().max(20000), factory_code: z.string().max(250),
  image_url: z.string().url().max(2048),
}).partial().strict().refine((v) => Object.keys(v).length > 0, "No hay cambios para enviar.");

export const erpProductSendSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product"), changes: erpProductChangesSchema }).strict(),
  z.object({ kind: z.literal("inventory"), type: z.enum(["input", "output"]),
    quantity: z.number().finite().positive().max(1_000_000_000), warehouseId: z.number().int().positive() }).strict(),
]);
export type ErpProductOperation = z.infer<typeof erpProductSendSchema>;
export type ErpProductChanges = z.infer<typeof erpProductChangesSchema>;
export type ErpTableOption = { id: string; label: string };
export type ErpProductSnapshot = {
  revision: string; values: Record<string, string | number | boolean | null>;
  tables: Record<string, ErpTableOption[]>; stock: string | null;
};
