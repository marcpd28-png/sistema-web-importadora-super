import { z } from "zod";

export const SIMULATOR_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
export const SIMULATOR_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm";

export function safeInlineMediaUrl(value: string) {
  if (value.length > Math.ceil(SIMULATOR_MEDIA_MAX_BYTES / 3) * 4 + 100) return null;
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !SIMULATOR_MEDIA_ACCEPT.split(",").includes(match[1])) return null;
  const encoded = match[2];
  const bytes = encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  return encoded.length % 4 === 0 && bytes > 0 && bytes <= SIMULATOR_MEDIA_MAX_BYTES ? value : null;
}

export const simulatorInputSchema = z.object({
  engine: z.enum(["BC", "ROCKY"]).default("BC"),
  content: z.string().trim().max(1200).default(""),
  name: z.string().trim().min(1).max(180).default("Cliente Simulador"),
  phone: z.string().trim().max(32).default("+51 999 888 777"),
  sessionKey: z.string().trim().min(1).max(80).default("default"),
  attachment: z.object({
    type: z.enum(["IMAGE", "AUDIO"]),
    dataUrl: z.string().max(Math.ceil(SIMULATOR_MEDIA_MAX_BYTES / 3) * 4 + 100),
  }).superRefine((attachment, ctx) => {
    if (!safeInlineMediaUrl(attachment.dataUrl) ||
      !attachment.dataUrl.startsWith(attachment.type === "IMAGE" ? "data:image/" : "data:audio/")) {
      ctx.addIssue({ code: "custom", message: "Adjunta una imagen o audio compatible de hasta 4 MB." });
    }
  }).optional(),
}).refine(value => Boolean(value.content || value.attachment), { message: "Escribe un mensaje o adjunta una imagen o audio." });

export function simulatorWebhookMessage(input: z.infer<typeof simulatorInputSchema>, identity: { from: string; id: string; timestamp: string }): Record<string, unknown> & { type: string } {
  const attachment = input.attachment;
  if (!attachment) return { ...identity, type: "text", text: { body: input.content } };
  const type = attachment.type.toLowerCase();
  return { ...identity, type, [type]: { link: attachment.dataUrl, caption: input.content } };
}
