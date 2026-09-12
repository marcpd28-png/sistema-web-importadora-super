import { z } from "zod";

export const routerV2VisionHintsSchema = z.object({
  brand: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(180).nullable().optional(),
  color: z.string().trim().max(80).nullable().optional(),
  code: z.string().trim().max(64).nullable().optional(),
  visibleText: z.array(z.string().trim().max(240)).max(30).default([]),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type RouterV2VisionHints = z.infer<
  typeof routerV2VisionHintsSchema
>;

export type RouterV2VisionAnalysis =
  | {
      status: "READY";
      hints: RouterV2VisionHints;
      model: string;
    }
  | {
      status: "NOT_CONFIGURED";
      hints: null;
    }
  | {
      status: "INVALID_IMAGE";
      hints: null;
    }
  | {
      status: "PROVIDER_ERROR";
      hints: null;
      reason: string;
    };

type ResponsesApiPayload = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

function imageInputAllowed(value: string) {
  const image = value.trim();
  if (!image) return false;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(image)) return true;

  try {
    const url = new URL(image);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function extractResponsesText(payload: ResponsesApiPayload) {
  const texts: string[] = [];

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        texts.push(content.text.trim());
      }
    }
  }

  return texts.join("\n").trim();
}

function extractJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return value.slice(start, end + 1);
}

export function parseRouterV2VisionText(
  value: string,
): RouterV2VisionHints | null {
  const json = extractJsonObject(value);
  if (!json) return null;

  try {
    const parsed = routerV2VisionHintsSchema.safeParse(
      JSON.parse(json),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function buildVisionInstruction(customerMessage: string) {
  const context = customerMessage.trim().slice(0, 1000);

  return [
    "Analiza una imagen enviada por un cliente de una tienda de productos.",
    "Tu única tarea es extraer pistas para buscar el producto en el catálogo interno.",
    "No confirmes la identidad exacta del producto; otro módulo hará esa validación contra la base de datos.",
    "No inventes marca, modelo, color ni código si no son visibles o razonablemente legibles.",
    "Prioriza texto impreso en producto, etiqueta, empaque, sticker, código o modelo.",
    "confidence debe representar qué tan confiables son las pistas visuales: 0 a 1.",
    "Devuelve únicamente un objeto JSON válido con estas claves:",
    '{"brand":string|null,"model":string|null,"color":string|null,"code":string|null,"visibleText":string[],"confidence":number}',
    context
      ? `Mensaje que acompañó la imagen (solo contexto, no prueba visual): ${context}`
      : "El cliente no añadió texto útil junto a la imagen.",
  ].join("\n");
}

export async function analyzeRouterV2ProductImage(input: {
  imageUrl: string;
  customerMessage?: string | null;
}): Promise<RouterV2VisionAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { status: "NOT_CONFIGURED", hints: null };
  }

  const imageUrl = input.imageUrl.trim();
  if (!imageInputAllowed(imageUrl)) {
    return { status: "INVALID_IMAGE", hints: null };
  }

  const model =
    process.env.ROUTER_V2_VISION_MODEL?.trim() ||
    "gpt-5.6-luna";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildVisionInstruction(
                    input.customerMessage ?? "",
                  ),
                },
                {
                  type: "input_image",
                  image_url: imageUrl,
                  detail: "low",
                },
              ],
            },
          ],
          max_output_tokens: 500,
        }),
        signal: controller.signal,
      },
    );

    let payload: ResponsesApiPayload = {};
    try {
      payload = (await response.json()) as ResponsesApiPayload;
    } catch {
      return {
        status: "PROVIDER_ERROR",
        hints: null,
        reason: `OpenAI returned HTTP ${response.status} without JSON`,
      };
    }

    if (!response.ok) {
      return {
        status: "PROVIDER_ERROR",
        hints: null,
        reason:
          payload.error?.message?.slice(0, 300) ||
          `OpenAI returned HTTP ${response.status}`,
      };
    }

    const outputText = extractResponsesText(payload);
    const hints = parseRouterV2VisionText(outputText);

    if (!hints) {
      return {
        status: "PROVIDER_ERROR",
        hints: null,
        reason: "Vision response did not contain valid product hints",
      };
    }

    return {
      status: "READY",
      hints,
      model,
    };
  } catch (error: unknown) {
    return {
      status: "PROVIDER_ERROR",
      hints: null,
      reason:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Unknown vision provider error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
