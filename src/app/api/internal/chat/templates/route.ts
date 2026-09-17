import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { contactTemplateValues, extractTemplateVariables, renderMessageTemplate, templateValuesSchema } from "@/lib/message-templates";
import { getActiveMessageTemplate, listMessageTemplates, MessageTemplateError } from "@/lib/message-templates-service";
import { templateErrorResponse } from "@/lib/message-templates-http";

function authorize(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY?.trim();
  if (!expected) return Response.json({ error: "Integración no configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("x-internal-api-key") ?? "");
  const secret = Buffer.from(expected);
  if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) return Response.json({ error: "No autorizado." }, { status: 401 });
  return null;
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    return Response.json({ items: await listMessageTemplates(true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return templateErrorResponse(error); }
}

const renderSchema = z.object({
  templateId: z.string().trim().min(1).max(191),
  conversationId: z.string().trim().min(1).max(191).optional(),
  variables: templateValuesSchema.default({}),
});

// Render only: n8n decides when to send and reports delivery through chat/outgoing.
export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    const input = renderSchema.parse(await request.json());
    const template = await getActiveMessageTemplate(input.templateId);
    let defaults: Record<string, string> = {};
    if (input.conversationId) {
      const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, include: { contact: true } });
      if (!conversation) throw new MessageTemplateError("La conversación no existe.", 404);
      defaults = contactTemplateValues(conversation.contact);
    }
    const values = { ...defaults, ...input.variables };
    const rendered = renderMessageTemplate(template.content, values);
    if (rendered.missing.length) return Response.json({ error: "Faltan variables para preparar la respuesta.", missingVariables: rendered.missing }, { status: 422 });
    if (rendered.tooLong || /\{\{|\}\}/.test(rendered.content)) throw new MessageTemplateError("La respuesta supera los 4000 caracteres o contiene variables sin resolver.", 422);
    return Response.json({
      content: rendered.content, type: "TEXT",
      template: {
        id: template.id, name: template.name, updatedAt: template.updatedAt.toISOString(), edited: false,
        values: Object.fromEntries(extractTemplateVariables(template.content).map((key) => [key, values[key]])),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return templateErrorResponse(error); }
}
