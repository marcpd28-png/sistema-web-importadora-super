import { z } from "zod";

export const TEMPLATE_CONTENT_LIMIT = 4000;
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/g;
const variableName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
  .refine((name) => !["constructor", "prototype"].includes(name), "Nombre de variable reservado.");

export function extractTemplateVariables(content: string): string[] {
  const variables = [...new Set([...content.matchAll(PLACEHOLDER)].map((match) => match[1]))];
  const remainder = content.replace(PLACEHOLDER, "");
  if (content.includes("{{{") || content.includes("}}}") || remainder.includes("{{") || remainder.includes("}}") || variables.some((name) => !variableName.safeParse(name).success)) {
    throw new Error("Usa variables como {{nombre}}: letras minúsculas, números y guion bajo, empezando con una letra (máximo 40 caracteres).");
  }
  if (variables.length > 20) throw new Error("Puedes usar hasta 20 variables por plantilla.");
  return variables;
}

export const templateValuesSchema = z.preprocess((value, ctx) => {
  if (value && typeof value === "object" && Object.hasOwn(value, "__proto__")) {
    ctx.addIssue({ code: "custom", message: "Nombre de variable reservado." });
  }
  return value;
}, z.record(variableName, z.string().trim().max(TEMPLATE_CONTENT_LIMIT))
  .refine((values) => Object.keys(values).length <= 20, "Puedes enviar hasta 20 variables."));

export const messageTemplateSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre.").max(120, "El nombre admite hasta 120 caracteres."),
  category: z.string().trim().max(60, "La categoría admite hasta 60 caracteres.").default(""),
  content: z.string().trim().min(1, "Escribe el mensaje.").max(TEMPLATE_CONTENT_LIMIT, "El mensaje admite hasta 4000 caracteres.")
    .superRefine((content, ctx) => {
      try { extractTemplateVariables(content); }
      catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); }
    }),
  isActive: z.boolean().default(true),
});

export const templateSelectionSchema = z.object({
  id: z.string().trim().min(1).max(191),
  updatedAt: z.string().datetime(),
  values: templateValuesSchema,
});

export type TemplateSelection = z.infer<typeof templateSelectionSchema>;
export const templateSnapshotSchema = templateSelectionSchema.extend({ name: z.string().trim().min(1).max(120), edited: z.boolean() });
export type MessageTemplateItem = z.infer<typeof messageTemplateSchema> & {
  id: string;
  variables: string[];
  updatedAt: string;
};
export type TemplateSnapshot = TemplateSelection & { name: string; edited: boolean };

// Plain substitution only. Templates never evaluate JavaScript or n8n expressions.
export function renderMessageTemplate(content: string, values: Record<string, string>) {
  const variables = extractTemplateVariables(content);
  const missing = variables.filter((name) => !Object.hasOwn(values, name) || !values[name]?.trim());
  const rendered = content.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) && values[name]?.trim() ? values[name].trim() : placeholder,
  );
  return { content: rendered, missing, tooLong: rendered.length > TEMPLATE_CONTENT_LIMIT };
}

export function contactTemplateValues(contact: { name?: string | null; phone?: string | null; phoneNormalized?: string | null }) {
  return { nombre: contact.name ?? "", telefono: contact.phoneNormalized ?? contact.phone ?? "" };
}
