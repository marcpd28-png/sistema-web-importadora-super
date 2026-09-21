/** Shared by BC and ROCKY; keep business questions out of product search. */
export function businessQuestion(text: string): "HOURS" | "ADDRESS" | null {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:horarios?|a que hora (?:abren|cierran|atienden)|hasta que hora|que dias (?:abren|atienden)|estan abiertos|atienden (?:hoy|los domingos|el domingo))\b/.test(value)) return "HOURS";
  if (/\b(?:direccion|ubicacion|donde (?:estan|queda|quedan|se encuentran)|como llego)\b/.test(value)) return "ADDRESS";
  return null;
}
