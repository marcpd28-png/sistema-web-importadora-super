/** Best-effort removal of common credential shapes before selective context reaches a model. */
export function redactSensitiveText(text: string) {
  return text
    .replace(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[credencial omitida]")
    .replace(/\bEAA[A-Za-z0-9]{30,}\b/g, "[credencial omitida]")
    .replace(/\b(?:password|contraseña|access_token|api[_-]?key|token)\s*[:=]\s*["']?[^\s,"'}]+/gi, "[credencial omitida]");
}
