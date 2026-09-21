import type { ProductFact } from "./contracts";

export function compareFacts(products: ProductFact[]) {
  const normalize = (text: string) => text.trim().toLocaleLowerCase("es");
  const attributes = products.map(p => {
    const entries = (p.technicalSpecs || "").split(/[;\n]/).flatMap(line => {
      const colon = line.indexOf(":");
      return colon > 0 ? [[normalize(line.slice(0, colon)), line.slice(colon + 1).trim()] as const] : [];
    });
    return { code: p.code, values: new Map(entries) };
  });
  const keys = [...new Set(attributes.flatMap(p => [...p.values.keys()]))].slice(0, 8);
  return keys.map(key => ({ attribute: key, values: attributes.map(p => ({ code: p.code, value: p.values.get(key) || "sin dato verificado" })),
    different: new Set(attributes.map(p => p.values.get(key))).size > 1 }));
}
export function productFromOwnUrl(text: string, origin: string): string | null {
  for (const raw of text.match(/https?:\/\/[^\s<>"']+/g) || []) {
    try {
      const url = new URL(raw);
      if (url.origin !== new URL(origin).origin) continue;
      const match = url.pathname.match(/^\/producto\/([^/]+)\/?$/);
      if (match) return decodeURIComponent(match[1]);
    } catch { /* External and malformed links never trigger a network fetch. */ }
  }
  return null;
}
