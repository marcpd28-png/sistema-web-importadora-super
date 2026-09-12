import type { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";

type ResponseContext = ReturnType<
  typeof buildRouterV2ResponseContext
>;

export type RouterV2AiDraftResult =
  | {
      status: "GENERATED";
      text: string;
      model: string;
    }
  | {
      status: "FALLBACK";
      text: string;
      reason: string;
    }
  | {
      status: "NOT_CONFIGURED";
      text: string;
    };

type ResponsesApiPayload = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

const AI_DRAFT_ANSWER_TYPES = new Set([
  "CATALOG_PURCHASE_MODE",
  "WHOLESALE_CATALOG",
  "RETAIL_DISCOVERY",
  "LOGISTICS",
  "PAYMENT",
  "DOCUMENT",
  "PRODUCT_CLARIFICATION",
  "IMAGE_PRODUCT_CLARIFICATION",
  "VARIANT_OPTIONS",
  "VARIANT_CLARIFICATION",
  "PRODUCT_CONFIRMED",
  "PRODUCT_DETAILS",
  "PRODUCT_SPECIFICATION",
  "PRODUCT_PRICE",
  "PRODUCT_STOCK",
  "PRODUCT_WHOLESALE",
  "PRICE_SUMMARY",
]);

function extractResponsesText(payload: ResponsesApiPayload) {
  const parts: string[] = [];

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        parts.push(content.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

function numericFacts(value: string) {
  return new Set(
    (value.match(/\d+(?:[.,]\d+)*/g) ?? []).map((item) =>
      item.replace(/[.,]/g, ""),
    ),
  );
}

function sameNumericFacts(baseline: string, candidate: string) {
  const expected = numericFacts(baseline);
  const actual = numericFacts(candidate);

  if (expected.size !== actual.size) return false;
  for (const item of expected) {
    if (!actual.has(item)) return false;
  }
  return true;
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function preservesProtectedTokens(
  baseline: string,
  candidate: string,
  context: ResponseContext,
) {
  const protectedTokens = [
    context.sales.productCode,
    context.sales.orderNumber,
  ].filter((value): value is string => Boolean(value?.trim()));

  const normalizedCandidate = normalizeToken(candidate);
  const normalizedBaseline = normalizeToken(baseline);

  return protectedTokens.every((token) => {
    const normalized = normalizeToken(token);
    if (!normalizedBaseline.includes(normalized)) return true;
    return normalizedCandidate.includes(normalized);
  });
}

export function routerV2AiDraftPassesGuard(input: {
  baseline: string;
  candidate: string;
  context: ResponseContext;
}) {
  const candidate = input.candidate.trim();
  if (!candidate || candidate.length > 5000) return false;
  if (!sameNumericFacts(input.baseline, candidate)) return false;
  if (!preservesProtectedTokens(input.baseline, candidate, input.context)) {
    return false;
  }
  return true;
}

function compactContext(context: ResponseContext) {
  return {
    answerType: context.answerType,
    resumeAction: context.resumeAction,
    customerMessage: context.customerMessage.slice(0, 1500),
    sales: {
      productCode: context.sales.productCode,
      productName: context.sales.productName,
      category: context.sales.category,
      brand: context.sales.brand,
      quantity: context.sales.quantity,
      unitPrice: context.sales.unitPrice,
      priceTier: context.sales.priceTier,
      total: context.sales.total,
      deliveryMethod: context.sales.deliveryMethod,
      paymentMethod: context.sales.paymentMethod,
    },
    product: context.product
      ? {
          descriptionShort: context.product.descriptionShort,
          description: context.product.description,
          technicalSpecs: context.product.technicalSpecs,
          available: context.product.available,
          wholesalePrice: context.product.wholesalePrice,
          wholesaleMinQty: context.product.wholesaleMinQty,
          matchedSpecification:
            context.product.matchedSpecification,
          specifications:
            context.product.specifications.slice(0, 8),
        }
      : null,
    business: context.business
      ? {
          businessName: context.business.businessName,
          currencySymbol: context.business.currencySymbol,
          supportHours: context.business.supportHours,
          storeAddress: context.business.storeAddress,
          paymentMethods: context.business.paymentMethods,
          deliveryMethods: context.business.deliveryMethods,
        }
      : null,
  };
}

function buildInstruction(
  baseline: string,
  context: ResponseContext,
) {
  return [
    "Eres el redactor de WhatsApp de una tienda.",
    "El Router ya decidió qué responder y qué paso comercial sigue. No cambies esa decisión.",
    "Reescribe el borrador para que suene humano, breve, claro y orientado a cerrar la venta sin ser insistente.",
    "Primero responde la duda concreta del cliente y luego continúa exactamente con el siguiente paso comercial indicado.",
    "No inventes datos, precios, stock, especificaciones, métodos de pago, métodos de entrega, descuentos, garantías ni políticas.",
    "Nunca indiques cantidades exactas de stock.",
    "No cambies ningún número, precio, cantidad, código de producto o número de pedido del borrador.",
    "No agregues números nuevos.",
    "No marques un voucher como pago confirmado.",
    "Devuelve únicamente el mensaje final para el cliente, sin análisis ni JSON.",
    `BORRADOR CONTROLADO:\n${baseline}`,
    `CONTEXTO CONTROLADO:\n${JSON.stringify(compactContext(context))}`,
  ].join("\n\n");
}

export async function draftRouterV2WithAi(input: {
  baseline: string;
  context: ResponseContext;
}): Promise<RouterV2AiDraftResult> {
  const baseline = input.baseline.trim();
  if (!baseline) {
    return {
      status: "FALLBACK",
      text: baseline,
      reason: "EMPTY_BASELINE",
    };
  }

  if (!AI_DRAFT_ANSWER_TYPES.has(input.context.answerType)) {
    return {
      status: "FALLBACK",
      text: baseline,
      reason: "ANSWER_TYPE_NOT_AI_DRAFTED",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "NOT_CONFIGURED",
      text: baseline,
    };
  }

  const model =
    process.env.ROUTER_V2_TEXT_MODEL?.trim() ||
    "gpt-5.6-luna";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

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
          input: buildInstruction(baseline, input.context),
          max_output_tokens: 900,
        }),
        signal: controller.signal,
      },
    );

    let payload: ResponsesApiPayload = {};
    try {
      payload = (await response.json()) as ResponsesApiPayload;
    } catch {
      return {
        status: "FALLBACK",
        text: baseline,
        reason: `NON_JSON_PROVIDER_RESPONSE_${response.status}`,
      };
    }

    if (!response.ok) {
      return {
        status: "FALLBACK",
        text: baseline,
        reason:
          payload.error?.message?.slice(0, 200) ||
          `PROVIDER_HTTP_${response.status}`,
      };
    }

    const candidate = extractResponsesText(payload);
    if (
      !routerV2AiDraftPassesGuard({
        baseline,
        candidate,
        context: input.context,
      })
    ) {
      return {
        status: "FALLBACK",
        text: baseline,
        reason: "FACT_GUARD_REJECTED",
      };
    }

    return {
      status: "GENERATED",
      text: candidate,
      model,
    };
  } catch (error: unknown) {
    return {
      status: "FALLBACK",
      text: baseline,
      reason:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "UNKNOWN_AI_DRAFT_ERROR",
    };
  } finally {
    clearTimeout(timeout);
  }
}
