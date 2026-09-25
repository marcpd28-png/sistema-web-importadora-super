const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Remove request wording before catalog fuzzy matching; never correct product identities here. */
export function catalogSubject(text: string) {
  return normalize(text)
    .replace(/\bm3(?=\s+pasa\b)/g, "me")
    .replace(/\b(?:vengo de|vi su publicidad(?: en)?)\s*(?:tik\s*tok|facebook|instagram)?\b/g, " ")
    .replace(/\b(?:soy de|envio a|envios a)\s+provincia\b/g, " ")
    .replace(/\b(?:muchas gracias|para hacer compras|por mayor|al por mayor)\b/g, " ")
    .replace(/\bdisculpe por la hora\b/g, " ")
    .replace(/\b(?:catalogos?|catalago|catalgoo)\b/g, " ")
    .replace(/\b(?:por\s+favor|x\s+favor|porfavor|porfa|porfas|porfabor|xfavor|xfav|xfa)\b/g, " ")
    .replace(/\b(?:buen(?:os)? dias?|buenas tardes|buenas noches|que tal)\b/g, " ")
    .replace(/\b(?:hola|buenas|ola|disculpe|casero|senorita|gracias|solicito|tendra|tendran|tiene|tienen|tienes|actualizado|actualizados|general|completo|completa|genersl|brindas|brinda|brindar|envieme|envienme|compartirme|pudiera|pudieran|mandar|algun|alguno|si|tuviese)\b/g, " ")
    .replace(/\b(?:puede|puedes|pueden|podria|podrias|podrian|podras|poddria|podia|brindarme|brindaria|brindan|comparte|compartes|compart3s|compartir|proporcionar|facilita|facilitar|enviar|enviarme|envia|envias|mandarme|pasarme|pasar|pasa|pasas|me|mw|su|sus|tu|tus|de|del|el|la|los|las|un|una|por|para|favor|productos|producto|quiero|quisiera|deseo|necesito|ver|dar|saber|consulta|tambien|nuevamente|muchas|perfecto|y|o|al)\b/g, " ")
    .replace(/[¿?!.,]/g, " ").replace(/\s+/g, " ").trim();
}

/** An empty subject means clarify or reuse a known product, never search the whole inventory. */
export function productSubject(text: string) {
  return normalize(text)
    .replace(/\b(?:por|en)?\s*(?:cajas?|paquetes?|docenas?)(?:\s+de\s+\d+)?\b/g, " ")
    .replace(/\bpor\s+\d+\b/g, " ")
    .replace(/\b(?:buen(?:os)? dias?|buenas tardes|buenas noches|que tal|por favor|x favor|por unidad)\b/g, " ")
    .replace(/\b(?:me|puede|puedes|podria|podrias|brinda|brindas|brindar|dar|decir|saber|hola|buenas|porfa|porfavor|gracias|info|informacion|precio|precios|costo|cuanto|cuesta|cuestan|sale|salen|esta|estan|del|de|el|la|los|las|su|sus|un|una|quiero|quisiera|busco|necesito|tienes|tienen|tiene|stock|disponible|disponibilidad|producto|productos|este|esta|esto|ese|esa|eso|lo|sigue|por|favor)\b/g, " ")
    .replace(/\b(?:que|cual|es|valor|sobre)\b/g, " ")
    .replace(/\b(?:fotos?|imagenes?|detalles?|caracteristicas|ficha|especificaciones)\b/g, " ")
    .replace(/\b(?:en|y|ya|si|tambien|mas|otro|otra|otros|otras|estos|estas|esos|esas|modelos?|disenos?|todos|solo|cuantos?|vale|valen|unidades?|piezas?|enviar|mandar|mandarme|manda|envia|podra|podras|podrias|buen|dia|porfabor|xfavor|xfav)\b/g, " ")
    .replace(/^\s*\d+\s*$/, "")
    .replace(/[¿?!.,]/g, " ").replace(/\s+/g, " ").trim();
}

export function businessTopics(text: string) {
  const t = normalize(text);
  return {
    hours: /\b(?:horarios?|a que hora (?:abren|cierran|atienden)|hasta que hora|que dias (?:abren|atienden)|estan abiertos|atienden (?:hoy|los domingos|el domingo))\b/.test(t),
    address: !/\b(?:mi ubicacion|mi direccion|costo.*(?:envio|delivery))\b|^direccion\s*:/.test(t) && /\b(?:direccion|ubicacion|como llego)\b|donde (?:queda|quedan).*tienda|donde (?:estan|se encuentran)(?: ustedes)?\s*[?!.]*$/.test(t),
  };
}
