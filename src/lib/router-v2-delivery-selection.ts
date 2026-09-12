import type { RouterV2Analysis } from "@/lib/conversation-router-v2";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function methodFromText(text: string) {
  if (/\bshalom\b/.test(text)) return "SHALOM";
  if (/\bolva\b/.test(text)) return "OLVA";
  if (/\b(recojo|recoger|pickup)\b/.test(text)) return "RECOJO";
  if (/\b(delivery|domicilio|reparto)\b/.test(text)) return "DELIVERY";
  return null;
}

export function applyRouterV2DeliverySelection(input: {
  analysis: RouterV2Analysis;
  content: string;
  stage?: string | null;
}): RouterV2Analysis {
  const text = normalize(input.content);
  const method = methodFromText(text);

  if (!method) return input.analysis;

  const exactChoice =
    /^(shalom|olva|recojo|pickup|delivery|domicilio|reparto)(?:\s+por favor)?[.!]?$/.test(
      text,
    );

  const explicitChoice =
    /\b(quiero|deseo|prefiero|elijo)\b.*\b(shalom|olva|recojo|pickup|delivery|domicilio|reparto)\b/.test(
      text,
    ) ||
    /\b(enviamelo|envienmelo|mandalo|mandamelo|mandenlo)\b.*\b(shalom|olva|domicilio|delivery)\b/.test(
      text,
    ) ||
    /\bvoy\s+a\s+recoger(?:lo)?\b/.test(text);

  const contextualChoice =
    input.stage === "AWAITING_DELIVERY_METHOD" && exactChoice;

  if (!explicitChoice && !contextualChoice) {
    return input.analysis;
  }

  return {
    ...input.analysis,
    slots: {
      ...input.analysis.slots,
      deliveryMethod: method,
    },
  };
}
