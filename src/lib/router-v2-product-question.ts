export type RouterV2ProductQuestionKind =
  | "DETAILS"
  | "SPECIFICATION"
  | "PRICE"
  | "STOCK"
  | "WHOLESALE"
  | null;

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectRouterV2ProductQuestion(
  message: string,
): RouterV2ProductQuestionKind {
  const text = normalize(message);
  if (!text) return null;

  if (
    /\b(bateria|autonomia|duracion|potencia|watts?|bluetooth|resistente al agua|ipx|ip67|ip68|peso|pesa|medidas|dimension(?:es)?|tamano|carga|cargador|usb|tipo c|type c|garantia)\b/.test(
      text,
    )
  ) {
    return "SPECIFICATION";
  }

  if (
    /\b(mas informacion|informacion|detalles|caracteristicas|especificaciones|ficha tecnica|que incluye|que trae|como es)\b/.test(
      text,
    )
  ) {
    return "DETAILS";
  }

  if (/\b(precio|costo|cuanto cuesta|cuanto sale|a cuanto)\b/.test(text)) {
    return "PRICE";
  }

  if (/\b(stock|disponible|disponibilidad|hay|tienen|lo tienes|queda)\b/.test(text)) {
    return "STOCK";
  }

  if (/\b(por mayor|mayorista|precio por cantidad|por caja)\b/.test(text)) {
    return "WHOLESALE";
  }

  return null;
}
