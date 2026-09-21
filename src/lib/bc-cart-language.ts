import { normalizeCommercialText } from "./commercial-query";
import type { MultiCart } from "./bc-multi-cart";

const quantityWords: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};
const quantityPattern = `(?:\\d+|${Object.keys(quantityWords).join("|")})`;
const quantitySuffix = `(${quantityPattern})(?:\\s+(?:unidad(?:es)?|unds?|uds?|piezas?))?$`;

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
  const change = text.match(new RegExp(`^(?:cambia|cambiar|cambiame|deja|dejame)\\s+(.+?)\\s+(?:a|en)\\s+${quantitySuffix}`))
    ?? text.match(new RegExp(`^(?:de|del)\\s+(.+?)\\s+(?:quiero|mejor|solo quiero)\\s+${quantitySuffix}`));
  if (change) { const code = resolve(change[1]); if (code) return `cambiar ${code} a ${quantityWords[change[2]] ?? change[2]}`; }
  if (/^(?:listo|sigamos|seguimos|quiero continuar|continuemos|continuar con la compra)$/.test(text)) return "continuar compra";
  if (/^(?:muestrame|mostrar|ver) (?:mi |el )?(?:pedido|carrito)$/.test(text)) return "ver carrito";
  if (/^(?:cancela|cancelar|anula|anular) (?:todo|la compra|mi pedido|el pedido)$/.test(text)) return "cancelar pedido";
  return text;
}
