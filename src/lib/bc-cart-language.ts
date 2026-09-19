import { normalizeCommercialText } from "./commercial-query";
import type { MultiCart } from "./bc-multi-cart";

/** Resolve only unique names or explicit line positions; never guess a pronoun across lines. */
export function normalizeCartCommand(content: string, cart: MultiCart): string {
  const text = normalizeCommercialText(content).replace(/[.!]+$/g, "").replace(/^(?:por favor|porfa)[, ]+|[, ]+(?:por favor|porfa)$/g, "").trim();
  const resolve = (reference: string) => {
    const ref = reference.replace(/^(?:el|la|del|de la)\s+/, "").trim();
    const ordinal = ["primero", "segundo", "tercero"].indexOf(ref.replace(/a$/, "o"));
    if (ordinal >= 0) return cart.lines[ordinal]?.code;
    const matches = cart.lines.filter(line => normalizeCommercialText(line.code) === ref || normalizeCommercialText(line.name) === ref);
    if (matches.length === 1) return matches[0].code;
    return /^(?:ese|esa|este|esta|lo|producto)$/.test(ref) && cart.lines.length === 1 ? cart.lines[0].code : undefined;
  };
  const remove = text.match(/^(?:quita|quitar|elimina|eliminar|saca|sacar|ya no quiero)\s+(.+)$/);
  if (remove) { const code = resolve(remove[1]); if (code) return `quitar ${code}`; }
  const change = text.match(/^(?:cambia|cambiar|cambiame|deja|dejame)\s+(.+?)\s+(?:a|en)\s+(\d+)(?:\s+unidad(?:es)?)?$/)
    ?? text.match(/^(?:de|del)\s+(.+?)\s+(?:quiero|mejor|solo quiero)\s+(\d+)(?:\s+unidad(?:es)?)?$/);
  if (change) { const code = resolve(change[1]); if (code) return `cambiar ${code} a ${change[2]}`; }
  if (/^(?:listo|sigamos|seguimos|quiero continuar|continuemos|continuar con la compra)$/.test(text)) return "continuar compra";
  if (/^(?:muestrame|mostrar|ver) (?:mi |el )?(?:pedido|carrito)$/.test(text)) return "ver carrito";
  if (/^(?:cancela|cancelar|anula|anular) (?:todo|la compra|mi pedido|el pedido)$/.test(text)) return "cancelar pedido";
  return text;
}
