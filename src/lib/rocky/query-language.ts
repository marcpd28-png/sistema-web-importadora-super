const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Remove request wording before catalog fuzzy matching; never correct product identities here. */
export function catalogSubject(text: string) {
  return normalize(text)
    .replace(/\bdisculpe por la hora\b/g, " ")
    .replace(/\b(?:catalogos?|catalago|catalgoo)\b/g, " ")
    .replace(/\b(?:por\s+favor|x\s+favor|porfavor|porfa|porfas|porfabor|xfavor|xfav)\b/g, " ")
    .replace(/\b(?:buen(?:os)? dias?|buenas tardes|buenas noches|que tal)\b/g, " ")
    .replace(/\b(?:hola|buenas|ola|disculpe|casero|senorita|gracias|solicito|tendra|tendran|tiene|tienen|tienes|actualizado|actualizados|general|completo|completa|genersl|brindas|brinda|brindar|envieme|envienme|compartirme|pudiera|pudieran|mandar|algun|alguno|si|tuviese)\b/g, " ")
    .replace(/[¿?!.,]/g, " ").replace(/\s+/g, " ").trim();
}

/** An empty subject means clarify or reuse a known product, never search the whole inventory. */
export function productSubject(text: string) {
  return normalize(text)
    .replace(/\b(?:buen(?:os)? dias?|buenas tardes|buenas noches|que tal|por favor|x favor|por unidad)\b/g, " ")
    .replace(/\b(?:me|puede|puedes|podria|podrias|brinda|brindas|brindar|dar|decir|saber|hola|buenas|porfa|porfavor|gracias|info|informacion|precio|precios|costo|cuanto|cuesta|cuestan|sale|salen|esta|estan|del|de|el|la|los|las|su|sus|un|una|quiero|quisiera|busco|necesito|tienes|tienen|tiene|stock|disponible|disponibilidad|producto|productos|este|esta|esto|ese|esa|eso|lo|sigue|por|favor)\b/g, " ")
    .replace(/\b(?:que|cual|es|valor)\b/g, " ")
    .replace(/\b(?:fotos?|imagenes?|detalles?|caracteristicas|ficha|especificaciones)\b/g, " ")
    .replace(/[¿?!.,]/g, " ").replace(/\s+/g, " ").trim();
}

export function businessTopics(text: string) {
  const t = normalize(text);
  return {
    hours: /\b(?:horarios?|a que hora (?:abren|cierran|atienden)|hasta que hora|que dias (?:abren|atienden)|estan abiertos|atienden (?:hoy|los domingos|el domingo))\b/.test(t),
    address: !/\b(?:mi ubicacion|mi direccion|costo.*(?:envio|delivery))\b|^direccion\s*:/.test(t) && /\b(?:direccion|ubicacion|como llego)\b|donde (?:queda|quedan).*tienda|donde (?:estan|se encuentran)(?: ustedes)?\s*[?!.]*$/.test(t),
  };
}
