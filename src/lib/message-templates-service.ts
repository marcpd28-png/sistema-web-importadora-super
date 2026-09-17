import { prisma } from "@/lib/prisma";
import {
  extractTemplateVariables, messageTemplateSchema, renderMessageTemplate,
  type TemplateSelection, type TemplateSnapshot,
} from "@/lib/message-templates";

export class MessageTemplateError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function listMessageTemplates(activeOnly = false) {
  const items = await prisma.messageTemplate.findMany({
    where: activeOnly ? { isActive: true } : {}, orderBy: { name: "asc" },
  });
  return items.map((item) => ({
    id: item.id, name: item.name, category: item.category ?? "", content: item.content,
    isActive: item.isActive, variables: extractTemplateVariables(item.content), updatedAt: item.updatedAt.toISOString(),
  }));
}

export async function saveMessageTemplate(input: unknown, id?: string) {
  const parsed = messageTemplateSchema.parse(input);
  const data = { ...parsed, category: parsed.category || null, variables: extractTemplateVariables(parsed.content) };
  return id ? prisma.messageTemplate.update({ where: { id }, data }) : prisma.messageTemplate.create({ data });
}

export async function getActiveMessageTemplate(id: string) {
  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!template || !template.isActive) throw new MessageTemplateError("La plantilla no existe o está inactiva. Selecciona otra plantilla.", 404);
  return template;
}

export async function prepareTemplateSnapshot(selection: TemplateSelection, content: string): Promise<TemplateSnapshot> {
  const template = await getActiveMessageTemplate(selection.id);
  if (template.updatedAt.toISOString() !== selection.updatedAt) {
    throw new MessageTemplateError("La plantilla cambió. Vuelve a seleccionarla antes de enviar.", 409);
  }
  const rendered = renderMessageTemplate(template.content, selection.values);
  if (rendered.missing.length) throw new MessageTemplateError(`Completa las variables: ${rendered.missing.join(", ")}.`);
  if (rendered.tooLong || content.length > 4000) throw new MessageTemplateError("El mensaje supera los 4000 caracteres.");
  if (/\{\{|\}\}/.test(content)) throw new MessageTemplateError("Reemplaza todas las variables antes de enviar.");
  const values = Object.fromEntries(extractTemplateVariables(template.content).map((key) => [key, selection.values[key]]));
  return { id: template.id, name: template.name, updatedAt: selection.updatedAt, values, edited: rendered.content.trim() !== content };
}
