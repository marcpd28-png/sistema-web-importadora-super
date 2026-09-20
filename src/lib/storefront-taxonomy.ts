import { getPublicProductName } from "@/lib/product-name";

// Commercial navigation is independent of ERP category labels and synchronization.
export const STOREFRONT_FAMILIES = [
  ["audio", "Audio"], ["moviles", "Celulares y tablets"],
  ["carga", "Cargadores y accesorios"], ["relojes", "Relojes inteligentes"],
  ["computacion", "Computación"], ["tv-videojuegos", "TV, proyectores y videojuegos"],
  ["foto-video", "Drones, foto y video"], ["hogar", "Hogar y cocina"],
  ["seguridad", "Hogar inteligente y seguridad"], ["auto", "Autos y motos"],
  ["cuidado", "Cuidado personal"], ["juguetes-escolares", "Juguetes y escolares"],
  ["bolsos", "Bolsos y accesorios"], ["intimo", "Bienestar íntimo"],
] as const;

export const STOREFRONT_CATEGORIES = [
  ["audifonos", "Audífonos", "audio"], ["parlantes", "Parlantes", "audio"],
  ["microfonos", "Micrófonos", "audio"], ["radios", "Radios y comunicación", "audio"],
  ["tablets", "Tablets", "moviles"], ["celulares", "Celulares", "moviles"],
  ["accesorios-tablets", "Accesorios para tablets", "moviles"],
  ["cargadores", "Cargadores", "carga"], ["cables", "Cables y adaptadores", "carga"],
  ["power-banks", "Power banks y energía", "carga"], ["soportes-celular", "Soportes para celular", "carga"],
  ["smartwatches", "Relojes y pulseras inteligentes", "relojes"], ["correas", "Correas y accesorios", "relojes"],
  ["mouse-teclados", "Mouse y teclados", "computacion"], ["monitores", "Monitores y extensores de pantalla", "computacion"],
  ["accesorios-pc", "Accesorios para computadora", "computacion"], ["memorias", "Memorias USB y microSD", "computacion"],
  ["redes", "Redes y conectividad", "computacion"],
  ["proyectores", "Proyectores", "tv-videojuegos"], ["pantallas-proyeccion", "Pantallas y accesorios de proyección", "tv-videojuegos"],
  ["televisores", "Televisores y accesorios", "tv-videojuegos"], ["tv-box", "TV Box y streaming", "tv-videojuegos"],
  ["consolas", "Consolas de videojuegos", "tv-videojuegos"], ["mandos", "Mandos y accesorios de videojuegos", "tv-videojuegos"],
  ["drones", "Drones", "foto-video"], ["accesorios-drones", "Accesorios para drones", "foto-video"],
  ["foto-video", "Cámaras y accesorios de foto y video", "foto-video"],
  ["cocina", "Cocina y electrodomésticos", "hogar"], ["iluminacion", "Iluminación", "hogar"],
  ["herramientas", "Herramientas y limpieza", "hogar"], ["hogar", "Organización y accesorios del hogar", "hogar"],
  ["alexas", "Amazon Echo y Alexa", "seguridad"], ["hogar-inteligente", "Enchufes y hogar inteligente", "seguridad"],
  ["camaras-seguridad", "Cámaras y grabadores de seguridad", "seguridad"],
  ["autos-motos", "Accesorios para autos y motos", "auto"],
  ["afeitadoras", "Afeitadoras y cortadoras", "cuidado"], ["cabello", "Secadoras y alisadores", "cuidado"],
  ["cuidado-personal", "Masajeadores y cuidado personal", "cuidado"],
  ["juguetes", "Juguetes", "juguetes-escolares"], ["escolares", "Útiles escolares", "juguetes-escolares"],
  ["bolsos", "Mochilas, carteras y bolsos", "bolsos"], ["bienestar-intimo", "Bienestar íntimo", "intimo"],
  ["otros", "Más productos", "hogar"],
] as const;

export function normalizeCatalogText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const OVERRIDES: Record<string, string> = {
  N917: "afeitadoras", L500: "cabello", N299: "autos-motos", N439: "hogar",
  N2325: "accesorios-pc", HPM32: "memorias", N2255: "iluminacion", N2098: "herramientas",
  N2176: "herramientas", N495: "redes", N927: "radios", N419: "autos-motos",
  PC367: "mouse-teclados", PC372: "audifonos", O825: "camaras-seguridad",
  O925: "escolares", N238: "televisores", N2078: "pantallas-proyeccion",
  N2261: "redes", O872: "televisores", L462: "hogar", N1436: "herramientas", N2100: "hogar",
  "O1014-NEGRO": "mouse-teclados", N2238: "hogar-inteligente", N2163: "hogar-inteligente",
  N1246: "hogar-inteligente", PC401: "monitores", PC402: "monitores", N2318: "herramientas",
  P1006: "radios", N2282: "radios", N2028: "hogar-inteligente", P373: "parlantes",
  "RGLO-TAPE": "hogar", "RGLO-MATE": "cocina", "RGLO-BOT": "hogar",
};

type Classifiable = { code: string; name: string; category?: string | null };
export function getStorefrontCategorySlug(product: Classifiable): string {
  const override = OVERRIDES[product.code.trim().toUpperCase()];
  if (override) return override;
  const name = normalizeCatalogText(getPublicProductName(product.name));
  const rules: Array<[RegExp, string]> = [
    [/consolador|vibrador|dildo|juguete sex/, "bienestar-intimo"],
    [/enchufe inteligente|tomacorriente.*wifi|smart plug|localizador|smart tag|candado inteligente|timbre/, "hogar-inteligente"],
    [/\becho (dot|spot|show|pop|studio)\b|\bparlante alexa\b|\balexa echo\b/, "alexas"],
    [/(ecran|tela|pantalla|soporte|tripode|control remoto).*pro[ jy]ector|\becran\b/, "pantallas-proyeccion"],
    [/(bateria|helice|repuesto|protector|estuche).*\b(dron|drone|dji)\b/, "accesorios-drones"],
    [/\bdron(es|e)?\b|dji (mini|neo|avata|flip)/, "drones"],
    [/\bproyector\b|\bprojector\b/, "proyectores"],
    [/^(mando|control|gamepad|joystick)\b.*(consola|videojuego|playstation|xbox|nintendo)/, "mandos"],
    [/\bconsola\b|game ?stick|game player|\br36s\b/, "consolas"],
    [/joystick|gamepad|\bmando\b|vr box/, "mandos"],
    [/extensor.*pantalla|extensor screen|\bmonitor\b/, "monitores"],
    [/mouse|teclado|keyboard/, "mouse-teclados"],
    [/para auto|para carro|para moto|para casco|car play|cigarrera|dashcam|arrancador/, "autos-motos"],
    [/intercomunicador|walkie|radio motorola|megafono/, "radios"],
    [/audifono|auricular|headphone|headset|\bbuds\b|\bairpods\b/, "audifonos"],
    [/microfono|microphone/, "microfonos"],
    [/afeit|rasur|corta.*(pelo|cabello)|\btrimmer\b|\bkemei\b/, "afeitadoras"],
    [/alisador|alizador|secador.*cab|ondulador|cepillo secador|plancha.*cabello/, "cabello"],
    [/lampara|linterna|reflector|tira.*led|cinta.*led|luces.*led|guirnalda/, "iluminacion"],
    [/taladro|hidrolavadora|aspiradora|vacuum|manguera|pistola.*pintura/, "herramientas"],
    [/power ?bank|cargador portatil|\bpila(s)?\b|estacion.*energia|panel solar/, "power-banks"],
    [/correa.*(watch|reloj)|cargador.*watch/, "correas"],
    [/cargador|charger|power adapter/, "cargadores"],
    [/memoria|micro ?sd|pendrive|usb (dato|diseno)/, "memorias"],
    [/repetidor|router|mesh|adaptador.*(bluetooth|red)|generador bluetooth/, "redes"],
    [/soporte.*laptop|holder.*laptop|cooler.*laptop/, "accesorios-pc"],
    [/tripode|gimbal|aro de luz|camara deportiva|camara action|estabilizador de video/, "foto-video"],
    [/soporte.*celular|holder.*celular|cooler.*celular|palo selfie/, "soportes-celular"],
    [/\bcable\b|\botg\b|adaptador.*usb/, "cables"],
    [/smart ?watch|smart band|redmi watch|reloj.*(pulsera|digital|acuatico)/, "smartwatches"],
    [/stylus|lapiz optico|\bpen bp/, "accesorios-tablets"],
    [/writing tablet|pizarra|calculadora|cuaderno|lapicero/, "escolares"],
    [/\btablet\b|honor pad|\bipad\b|blackview link/, "tablets"],
    [/\bcelular\b|smartphone|\biphone\b|galaxy [aszm]|redmi (note|\d)|moto g/, "celulares"],
    [/camara.*(seguridad|vigilancia|espia)|\bezviz\b|\bdahua\b|camara ip|foco camara/, "camaras-seguridad"],
    [/tv box|tv stick|fire tv|adaptador.*(z30|z8)|xuper tv/, "tv-box"],
    [/smart tv|televisor|tv a pro|antena.*hdtv/, "televisores"],
    [/parlante|speaker|soundbar|barra de sonido|torre de audio|karaoke/, "parlantes"],
    [/\bradio\b/, "radios"],
    [/licuadora|batidora|hervidor|olla|sarten|exprimidor|cafetera|waflera|freidora|cocina|procesador|hacer hielo|cuchillo/, "cocina"],
    [/masajeador|cuidado personal|corrector.*postura/, "cuidado-personal"],
    [/juguete|hidrogel|pistola.*agua|pileta.*ninos/, "juguetes"],
    [/mochila|morral|cartera|billetera|bolso|maleta/, "bolsos"],
  ];
  const match = rules.find(([pattern]) => pattern.test(name));
  if (match) return match[1];
  const category = normalizeCatalogText(product.category ?? "");
  const fallback: Array<[RegExp, string]> = [
    [/auricular|audio/, "audifonos"], [/parlante/, "parlantes"], [/bateria/, "power-banks"],
    [/perifer/, "accesorios-pc"], [/cocina/, "cocina"], [/ilumin/, "iluminacion"],
    [/hogar/, "hogar"], [/cuidado/, "cuidado-personal"], [/escolar/, "escolares"],
    [/smart ?watch/, "smartwatches"], [/celulares/, "cables"], [/almacenamiento/, "memorias"],
    [/juguete.*sex/, "bienestar-intimo"], [/juguet/, "juguetes"], [/bolso|billetera/, "bolsos"],
  ];
  return fallback.find(([pattern]) => pattern.test(category))?.[1] ?? "otros";
}

export const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  auriculares: "audifonos", "audio-y-sonido": "familia-audio", "parlante-inteligentes": "alexas",
  "dispositivos-portatiles": "familia-moviles", perifericos: "familia-computacion", baterias: "power-banks",
  "accesorios-para-celulares": "familia-carga", "dispositivos-de-almacenamiento": "memorias",
  "smart-watch-y-sus-accesorios": "familia-relojes", "smart-watch-y-sus-complementos": "familia-relojes",
  "entretenimiento-y-multimedia": "familia-tv-videojuegos", "camara-de-seguridad": "camaras-seguridad",
  "accesorios-para-auto": "autos-motos", "utencillos-de-cocina-y-accesorios-de-uso-domestico": "cocina",
  "articulos-para-el-hogar": "familia-hogar", "articulos-para-el-hogar-e-iluminacion": "familia-hogar",
  "accesorios-de-cuidado-personal": "familia-cuidado", "maquina-de-cuidado-personal": "afeitadoras",
  "articulos-escolares": "escolares", "equipaje-bolsos": "bolsos", billetera: "bolsos",
  "juguetes-ninos": "juguetes", laptop: "monitores", "juguetes-sexuales": "bienestar-intimo",
};

export function canonicalCategorySlug(slug: string) { return LEGACY_CATEGORY_ALIASES[slug] ?? slug; }
export function categoryMatches(leaf: string, requested: string) {
  const canonical = canonicalCategorySlug(requested);
  return !canonical || canonical === "all" || leaf === canonical ||
    STOREFRONT_CATEGORIES.some(([slug, , family]) => slug === leaf && `familia-${family}` === canonical);
}

const COLOR = /(?:^|[-\s])(negro|black|blanco|white|azul|blue|rojo|red|rosa|rosado|pink|gris|grey|gray|silver|plateado|dorado|gold|verde|green|cafe|brown|orange|naranja)$/i;
export function variantColor(product: { code: string }) { return product.code.match(COLOR)?.[1] ?? null; }
export function variantGroupKey(product: Classifiable & { id: string; brand?: string | null }) {
  if (!variantColor(product)) return product.id;
  const baseCode = product.code.replace(COLOR, "").toUpperCase();
  const name = normalizeCatalogText(getPublicProductName(product.name))
    .replace(/\b(negro|black|blanco|white|azul|blue|rojo|red|rosa|rosado|pink|gris|grey|gray|silver|plateado|dorado|gold|verde|green|cafe|brown|orange|naranja)\b/g, "")
    .replace(/\b0\d{4,}\b/g, "").replace(/\s+/g, " ").trim();
  return `${baseCode}|${normalizeCatalogText(product.brand ?? "")}|${name}`;
}

export function groupColorVariants<T extends Classifiable & { id: string; brand?: string | null }>(products: T[]) {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    const key = variantGroupKey(product);
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  return [...groups.values()];
}
