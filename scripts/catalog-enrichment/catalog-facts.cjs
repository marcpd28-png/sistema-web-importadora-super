// Extract only explicit catalog statements. This is NOT manufacturer research or image OCR.
const clean = value => String(value || '').replace(/_x000D_/gi, ' ').replace(/\s+/g, ' ').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const types = [
  [/CORREA.*(?:SMART|RELOJ)/, 'Correa para reloj'], [/PAD\s*MOUSE/, 'Alfombrilla para mouse'],
  [/ECRAN|PANTALLA.*PARA PROYECTOR/, 'Pantalla de proyección'], [/EXTENSOR.*PANTALLA/, 'Extensor de pantalla'],
  [/CONTROL REMOTO/, 'Control remoto'], [/SOPORTE|HOLDER/, 'Soporte'], [/CABLE/, 'Cable'],
  [/CIGARRERA|CARGADOR.*(?:AUTO|CARRO)/, 'Cargador para vehículo'],
  [/POWER\s*BANK|CARGADOR PORTATIL|BATERIA PORTATIL/, 'Batería externa'],
  [/ESTACION DE (?:ENERGIA|CARGA)/, 'Estación de energía'], [/CARGADOR|\bDADO\b/, 'Cargador'],
  [/ADAPTADOR|\bOTG\b/, 'Adaptador'], [/\bHUB\b/, 'Concentrador USB'],
  [/MICRO\s*SD|MEMORIA|\bUSB DISEÑO\b/, 'Dispositivo de almacenamiento'],
  [/TECLADO.*MOUSE|MOUSE.*TECLADO/, 'Conjunto de teclado y mouse'], [/TECLADO/, 'Teclado'], [/\bMOUSE\b/, 'Mouse'],
  [/AUDIFONO|AURICULAR|EARBUD|EARPOD|AIRPOD|\bBUDS\b|\bTWS\b|\bBLUETOO?TH?\s+VINCHA/, 'Audífonos'],
  [/PARLANTE|SPEAKER|TORRE DE AUDIO|BARRA DE SONIDO/, 'Parlante'], [/MEGAFONO/, 'Megáfono'],
  [/MICROFONO/, 'Micrófono'], [/MEZCLADOR DE SONIDO|AUDIO INTERFACE/, 'Equipo de audio'],
  [/INTERCOMUNICADOR/, 'Intercomunicador'], [/\bRADIO\b/, 'Radio'],
  [/SMART\s*WATCH|SMART\s*BAND/, 'Reloj o pulsera inteligente'],
  [/CAMARA/, 'Cámara'], [/PROYECTOR/, 'Proyector'], [/TV BOX|DECODIFICADOR/, 'Reproductor multimedia'],
  [/\bTV\b|TELEVISOR/, 'Televisor'], [/MINI PC/, 'Mini PC'], [/TABLET|\bPAD\b/, 'Tableta'], [/CELULAR/, 'Teléfono móvil'],
  [/ROUTER/, 'Router'], [/REPETIDOR|REPEATER|EXTENDER/, 'Repetidor de red'], [/\bSWITCH\b/, 'Switch de red'],
  [/LOCALIZADOR|AIR TAG|SMART TAG|FINDER|TRACKER/, 'Localizador'], [/LAPIZ|PENCIL|STYLUS/, 'Lápiz digital'],
  [/GRABADORA|\bNVR\b/, 'Grabador'], [/DRON/, 'Dron'], [/SCOOTER/, 'Scooter eléctrico'], [/BICIMOTO/, 'Bicimoto eléctrica'],
  [/GAMEPAD|JOYSTICK|MANDO/, 'Control de videojuegos'], [/CONSOLA/, 'Consola de videojuegos'],
  [/TRIPODE|SELFIE STICK|PALO SELFIE/, 'Trípode o palo selfie'], [/LINTERNA/, 'Linterna'],
  [/PANEL SOLAR|KIT SOLAR/, 'Equipo solar'], [/REFLECTOR/, 'Reflector'], [/LAMPARA/, 'Lámpara'],
  [/TIRA.*(?:LED|LUZ)|LED LIGHT STRIP/, 'Tira de iluminación'], [/PANEL.*LED|LED MATRIX/, 'Panel LED'],
  [/ARO DE LUZ/, 'Aro de iluminación'], [/FOCO|LUCES|LUZ /, 'Iluminación'],
  [/COOLER/, 'Base o ventilador de refrigeración'], [/VENTILADOR/, 'Ventilador'],
  [/FREIDORA/, 'Freidora'], [/HERVIDOR|TETERA/, 'Hervidor'], [/LICUADORA/, 'Licuadora'],
  [/BATIDORA/, 'Batidora'], [/PLANCHA.*CABELLO|ALIZADORA|ALISADORA/, 'Plancha para cabello'],
  [/PLANCHA/, 'Plancha'], [/ONDULADOR/, 'Ondulador de cabello'], [/SECADORA|SECADOR/, 'Secador'],
  [/AFEITAD|MAQUINA.*BARBA|MAQUINA.*CABELLO/, 'Máquina de cuidado personal'],
  [/KEMEI|\bKM-\d/, 'Máquina de cuidado personal'], [/COCINA/, 'Cocina'], [/OLLA/, 'Olla'],
  [/SANDWICHERA/, 'Sandwichera'], [/WAFLERA/, 'Waflera'], [/PARRILLA/, 'Parrilla'], [/EXPRIMIDOR/, 'Exprimidor'],
  [/MOLINO|MOLEDOR/, 'Molino'], [/PICATODO|CORTADOR/, 'Picadora o cortador'], [/LAVADORA/, 'Lavadora'],
  [/ASPIRADORA/, 'Aspiradora'], [/HUMIDIFICADOR/, 'Humidificador'], [/PURIFICADOR/, 'Purificador'],
  [/CALEFACTOR|HEATER/, 'Calefactor'], [/HIELO/, 'Máquina de hielo'], [/POPCORN/, 'Máquina de palomitas'],
  [/TERMO|VACUUM CUP/, 'Termo'], [/VASO|BOTTLE|BOTELLA/, 'Vaso o botella'], [/CALCULADORA/, 'Calculadora'],
  [/PILA|BATERIA/, 'Pila o batería'], [/ESTABILIZADOR|REGLETA|MULTICONTACTO|ENCHUFE|INVERSOR/, 'Accesorio eléctrico'],
  [/INFLADOR|INFLADO|COMPENSOR/, 'Inflador'], [/HIDROLAVADORA/, 'Hidrolavadora'], [/SOPLADOR/, 'Soplador'],
  [/CERRADURA|CANDADO/, 'Cerradura o candado'], [/MOCHILA|MORRAL/, 'Mochila o morral'],
  [/MASAJEADOR/, 'Masajeador'], [/JUGUETE|JUGT|VIBRADOR/, 'Juguete'], [/LENTES/, 'Lentes'], [/RELOJ/, 'Reloj'],
];
const brands = ['HARMAN KARDON', 'BAIHUO CITY', 'BLACKVIEW', 'SOUNDPEATS', 'SOUNDCORE', 'TRONSMART', 'SKULLCANDY', 'MICRONICS', 'MICRONIC', 'CYBERTEL', 'TRANSFORMERS', 'HIKVISION', 'HIKSEMI', 'KINGSTON', 'LOGITECH', 'REDRAGON', 'ECOfLOW', 'BOSSNEY', 'KAPERH', 'KAPER', 'XIAOMI', 'REDMI', 'SAMSUNG', 'HUAWEI', 'MOTOROLA', 'PHILIPS', 'UGREEN', 'EWTTO', 'ZEALOT', 'HOPESTAR', 'HALION', 'SONIVOX', 'BARETONE', 'LIDIMI', 'ENKORE', 'ROZIA', 'KEMEI', 'LINKMAX', 'HIFUTURE', 'HOCO', 'HAVIT', 'HAYLOU', 'HONOR', 'APPLE', 'SONY', 'JBL', '1HORA', 'FIFINE', 'MAONO', 'IMILAB', 'EZVIZ', 'DAHUA', 'QCY', 'SUDIO', 'REALME', 'LENOVO', 'BASEUS', 'BOMA', 'ROMAX', 'HOCHI', 'YOOKIE', 'DCOLOR', 'REDD', 'CAFini', 'BLESS', 'CUDY', 'DJI', 'NAVEE', 'OKAI', 'HEEMER', 'AIWA', 'SEISA', 'INNOS', 'KZ'];

function catalogFacts(product) {
  const original = clean(product.name);
  // Do not propagate serial numbers, IMEIs, customs identifiers, or internal shipment strings.
  const title = original.replace(/^\([^)]*\)\s*/, '').split(/\b(?:SERIE|IMEI|DUA)\s*[:/]/i)[0].trim();
  const n = normalized(title); const facts = []; const warnings = [];
  const add = (name, value, quote, detail = true) => { if (value && !facts.some(x => x.name === name)) facts.push({ name, value, quote: clean(quote), detail }); };
  // The first product noun wins: a charger WITH a cable remains a charger.
  const type = types.map(([re, label], order) => ({ at: n.search(re), label, order }))
    .filter(t => t.at >= 0).sort((a, b) => a.at - b.at || a.order - b.order)[0];
  if (type) add('Tipo de producto', type.label, title, false);
  const own = /\b(?:M\.\s*SUPER|MARCA\s+SUPER|SUPER\s+(?:CARGADOR|POWER BANK|SOPORTE|PARLANTE)|(?:CABLE|BT|CARGADOR|AUTO)\s+SUPER\b)/i.test(title);
  const brand = own ? 'SUPER / Importaciones Super' : brands.find(b => new RegExp(`(?:^|[^A-Z0-9])${b.toUpperCase()}(?:$|[^A-Z0-9])`).test(n));
  if (brand) add('Marca indicada en el catálogo', brand === 'KAPER' ? 'KAPER (según denominación del catálogo)' : brand.toUpperCase() === 'ECOFLOW' ? 'EcoFlow' : brand, title, false);
  const references = [...new Set((n.match(/\b[A-Z]{1,8}[-.][A-Z0-9]*\d[A-Z0-9.-]*\b/g) || [])
    .filter(value => ![normalized(product.code), 'USB-C', 'USB-A'].includes(value) && value.length <= 40))];
  if (references.length === 1) add('Referencia indicada en el catálogo', references[0], references[0]);
  else if (references.length > 1) warnings.push('El título contiene varias referencias; confirmar el modelo exacto antes de usar documentación externa.');
  const colorNames = { BLACK: 'Negro', NEGRO: 'Negro', BLANCO: 'Blanco', WHITE: 'Blanco', AZUL: 'Azul', BLUE: 'Azul', RED: 'Rojo', ROJO: 'Rojo', ROSADO: 'Rosado', ROSA: 'Rosado', PINK: 'Rosado', VERDE: 'Verde', GREEN: 'Verde', PURPURA: 'Púrpura', PURPLE: 'Púrpura', MORADO: 'Morado', BEIGE: 'Beige', GRAY: 'Gris', GREY: 'Gris', GRIS: 'Gris', SILVER: 'Plateado', DORADO: 'Dorado', GOLD: 'Dorado', NARANJA: 'Naranja', ORANGE: 'Naranja', AMARILLO: 'Amarillo', YELLOW: 'Amarillo', CAMUFLADO: 'Camuflado' };
  const variant = normalized(product.code).split('-').at(-1).replace(/[.()]/g, '').trim();
  if (colorNames[variant] && !/CAJA|EMPAQUE|BOLSA/.test(n)) add('Color de la variante anunciado', colorNames[variant], product.code);
  const capture = (re, name, render) => { const m = n.match(re); if (m) add(name, render(m), m[0]); };
  capture(/(?:^|[^A-Z0-9.-])(\d+(?:[.,]\d+)?)\s*W\b/, 'Potencia anunciada', m => `${m[1]} W indicados en el catálogo; ${/P\.?M\.?P\.?O/.test(n) ? 'valor PMPO, no equivale a RMS' : /PARLANTE|TORRE DE AUDIO|MEGAFONO/.test(n) ? 'no se confirma potencia RMS' : 'rendimiento y condiciones de funcionamiento pendientes de verificar'}.`);
  capture(/(?:^|[^A-Z0-9.-])(\d+(?:[.,]\d+)?)\s*MAH\b/, 'Capacidad de batería anunciada', m => `${m[1]} mAh; valor nominal anunciado, no medido.`);
  capture(/(?:^|[^A-Z0-9.-])(\d+(?:[.,]\d+)?)\s*WH\b/, 'Energía de batería anunciada', m => `${m[1]} Wh según catálogo.`);
  // Never turn amperes or the misspelling MHA into a battery capacity.
  if (/\bAM[P]?ERIOS\b|\d\s*MHA\b/.test(n)) warnings.push('La unidad de capacidad del título es ambigua; no convertir automáticamente a mAh.');
  if (/AUDIFONO|BLUETOOTH|\bBT\b|PARLANTE/.test(n)) capture(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:HRS|HORAS|H)\b/, 'Autonomía anunciada', m => `${m[1]} horas; el catálogo no especifica volumen, modo ni si incluye el estuche.`);
  if (/CABLE|MANGUERA|TIRA/.test(n)) capture(/(?:^|[^A-Z0-9.-])(\d+(?:[.,]\d+)?)\s*(?:METROS?|M)\b/, 'Longitud anunciada', m => `${m[1]} m según catálogo.`);
  if (/TERMO|OLLA|HERVID|TETERA|FREIDORA|LICUADORA|LAVADORA|EXPRIMIDOR|PICATODO|VASO|BOTELLA/.test(n)) capture(/(?:^|[^A-Z0-9.-])(\d+(?:[.,]\d+)?)\s*(LITROS?|ML|L)\b/, 'Capacidad de recipiente anunciada', m => `${m[1]} ${m[2] === 'ML' ? 'ml' : 'l'} según catálogo.`);
  if (/MEMORIA|\bUSB\b|MICRO\s*SD|CONSOLA/.test(n) && !/TABLET|RAM|PAD\b|MINI PC/.test(n)) capture(/(?:^|[^A-Z0-9.-]|\bX)(\d+)\s*(GB|TB)\b/, 'Almacenamiento anunciado', m => `${m[1]} ${m[2]}; capacidad nominal, espacio utilizable menor.`);
  if (/TABLET|\bPAD\b|MINI PC|CELULAR|LINK 8/.test(n)) {
    capture(/(?:^|\s)(\d+)\s*(?:GB)?\s*(?:RAM\s*)?\+\s*(\d+)\s*GB\b/, 'Memoria anunciada', m => `${m[1]} GB + ${m[2]} GB según catálogo; confirmar RAM física, ampliación virtual y almacenamiento.`);
    capture(/(\d+)\s*GB\s*RAM\b/, 'Memoria RAM anunciada', m => `${m[1]} GB; confirmar si el valor incluye ampliación virtual.`);
    capture(/(\d+)\s*GB\s*ROM\b/, 'Almacenamiento anunciado', m => `${m[1]} GB según catálogo; espacio utilizable menor.`);
  }
  if (/PANTALLA|\bTV\b|TELEVISOR|ECRAN|TABLET|EXTENSOR/.test(n) && !/PARLANTE|PROYECTOR.*LUMENS/.test(n)) capture(/(?:^|[^A-Z0-9.-])(\d+(?:[.,]\d+)?)\s*(?:PULGADAS?|INCH|["”])/, 'Diagonal de pantalla anunciada', m => `${m[1]} pulgadas según catálogo.`);
  if (/PARLANTE/.test(n)) capture(/(?:^|[^A-Z0-9.-])(\d+(?:[.,]\d+)?)\s*(?:PULGADAS?|["”])/, 'Tamaño anunciado de parlante', m => `${m[1]} pulgadas; corresponde al tamaño indicado en el catálogo, no a las dimensiones de la caja.`);
  if (/\bBLUETOO?TH\b|\bBT\b/.test(n)) add('Conectividad anunciada', 'Bluetooth; versión y perfiles no especificados en el catálogo.', title);
  if (/WI-?FI|\bWIFI\b/.test(n)) add('Red inalámbrica anunciada', 'Wi-Fi; confirmar bandas, protocolos y requisitos del modelo.', title);
  if (/\bC\s+A\s+C\b|TYPE-C TO C|USB-C TO USB-C|USB-C A USB-C/.test(n)) add('Conexión anunciada', 'USB-C a USB-C; no implica salida de video ni una velocidad de datos determinada.', title);
  else if (/\bC\s+A\s+LIGHTNING|USB-C.*LIGHTNING/.test(n)) add('Conexión anunciada', 'USB-C a Lightning según catálogo; verificar compatibilidad con el equipo.', title);
  else if (/TIPO\s*C|TYPE\s*C|USB-C/.test(n)) add('Conector anunciado', 'USB-C; el título no confirma todas las funciones del puerto o cable.', title);
  else if (/LIGHTNING/.test(n)) add('Conector anunciado', 'Lightning según catálogo; verificar compatibilidad con el equipo.', title);
  else if (/TIPO\s*V8/.test(n)) add('Conector anunciado', 'V8 (denominación del catálogo); verificar forma y compatibilidad antes de elegir.', title);
  if (/\bHDMI\b/.test(n)) add('Interfaz anunciada', 'HDMI; versión, dirección de conversión y resolución máxima pendientes de verificar.', title);
  if (/\bRGB\b/.test(n)) add('Iluminación anunciada', 'RGB según catálogo; no se confirma control por software.', title);
  else if (/LUCES LED|LUZ LED/.test(n)) add('Iluminación anunciada', 'LED según catálogo.', title);
  if (/CON\s+(?:(?:DOS|2|UN|1)\s+)?MICROFONOS?\b/.test(n)) capture(/CON\s+(?:(DOS|2|UN|1)\s+)?MICROFONOS?\b/, 'Micrófono anunciado', m => m[1] === 'DOS' || m[1] === '2' ? 'Con dos micrófonos según catálogo; confirmar tipo y accesorios.' : 'Con micrófono según catálogo; confirmar tipo y accesorios.');
  if (/\bCON CABLE\b|\bCABLEADO\b|\bALAMBRICO\b/.test(n)) add('Conexión por cable anunciada', 'Sí, indicada en el catálogo.', title);
  if (/\bINALAMBRICO\b|\bWIRELESS\b/.test(n) && !/BLUETOO?TH|\bBT\b/.test(n)) add('Conexión inalámbrica anunciada', 'Sí; tecnología y requisitos pendientes de confirmar.', title);
  if (/\bMECANICO\b/.test(n) && /TECLADO/.test(n)) add('Mecanismo anunciado', 'Teclado mecánico según catálogo; tipo de interruptores pendiente de confirmar.', title);
  if (/PLEGABLE/.test(n)) add('Diseño anunciado', 'Plegable según catálogo.', title);
  if (/RETRACTIL/.test(n)) add('Diseño retráctil anunciado', 'Retráctil según catálogo.', title);
  if (/SOPORTE|HOLDER/.test(n) && /MAGNETIC|IMANTADO/.test(n)) add('Sujeción anunciada', 'Magnética; verificar requisitos del teléfono o accesorio.', title);
  if (/\bMETALICO\b|\bMETAL\b/.test(n)) add('Material anunciado', 'Metal en la pieza indicada por el catálogo; no confirma la composición de todos los componentes.', title);
  if (/ACERO INOXIDABLE/.test(n)) add('Material anunciado', 'Acero inoxidable según catálogo.', title);
  if (/SILICONA/.test(n)) add('Material anunciado', 'Silicona según catálogo.', title);
  if (/COCINA (?:A |PARA )?GAS/.test(n)) add('Fuente de energía anunciada', 'Gas; tipo de gas, presión y conexiones pendientes de confirmar.', title);
  else if (/ELECTRIC[AO]/.test(n) && !/SCOOTER|BICIMOTO/.test(n)) add('Fuente de energía anunciada', 'Eléctrica; tensión y consumo pendientes de confirmar.', title);
  if (/CORREA/.test(n)) capture(/(\d{2}(?:\/\d{2}){1,5})MM/, 'Medidas anunciadas de compatibilidad', m => `${m[1]} mm según catálogo; confirmar sistema de anclaje y modelo del reloj.`);
  if (/\bCABLE AUXILIAR\b/.test(n)) add('Uso anunciado', 'Conexión auxiliar de audio; conectores y longitud pendientes de confirmar.', title);
  if (/MOUSE/.test(n)) capture(/(\d+)\s*DPI\b/, 'Resolución de sensor anunciada', m => `${m[1]} DPI según catálogo.`);
  if (/PAD MOUSE/.test(n)) capture(/(\d+)\s*[*X]\s*(\d+)\s*CM\b/, 'Medidas anunciadas', m => `${m[1]} × ${m[2]} cm según catálogo.`);
  if (/MOUSE|TECLADO|AURICULAR/.test(n) && /\bUSB\b/.test(n) && !/USB-C|TIPO C/.test(n)) add('Interfaz anunciada', 'USB según catálogo; versión y funciones pendientes de confirmar.', title);
  if (/MOUSE.*OPTICO|OPTICO.*MOUSE/.test(n)) add('Tipo de sensor anunciado', 'Óptico según catálogo.', title);
  if (/PROYECTOR/.test(n)) capture(/(?:^|\s)(\d+)\s*ANSI\b/, 'Brillo anunciado', m => `${m[1]} lúmenes ANSI según catálogo; no medidos independientemente.`);
  if (/TRIPODE/.test(n)) capture(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(METROS?|M|CM)\b/, 'Medida anunciada de trípode', m => `${m[1]} ${m[2] === 'CM' ? 'cm' : 'm'} según catálogo; confirmar altura útil.`);
  if (/CAMARA/.test(n)) capture(/(?:^|\s)(\d+)\s*MP\b/, 'Resolución anunciada de cámara', m => `${m[1]} MP según catálogo; confirmar resolución por lente.`);
  if (/CON CONTROL REMOTO/.test(n)) add('Control anunciado', 'Con control remoto según catálogo.', title);
  if (/\bSOLAR\b/.test(n)) add('Función solar anunciada', 'El catálogo indica función solar; potencia del panel y condiciones de carga pendientes de verificar.', title);
  if (/PANTALLA.*TACTIL|TACTIL.*PANTALLA/.test(n)) add('Control táctil anunciado', 'Pantalla táctil según catálogo.', title);
  if (/SOPORTE|HOLDER/.test(n)) {
    if (/PARA (?:AUTO|CARRO)|RETROVISOR/.test(n)) add('Instalación anunciada', 'Para vehículo; confirmar dimensiones y sistema de fijación.', title);
    else if (/LAPTOP/.test(n)) add('Uso anunciado', 'Soporte para laptop; confirmar dimensiones y carga admitida.', title);
    else if (/CELULAR|TELEFONO/.test(n)) add('Uso anunciado', 'Soporte para teléfono; confirmar medidas y sistema de fijación.', title);
  }
  if (/\bRECARGABLE\b/.test(n)) add('Alimentación anunciada', 'Batería recargable; capacidad y autonomía no especificadas en el título.', title);
  if (/PORT|PUERTOS?/.test(n)) capture(/(\d+)\s*(?:-PORT|PUERTOS?)\b/, 'Puertos anunciados', m => `${m[1]} puertos; tipos y uso simultáneo pendientes de verificar.`);
  if (/\bANC\b/.test(n)) add('Cancelación de ruido anunciada', /SIN ANC/.test(n) ? 'El catálogo indica sin ANC.' : 'ANC anunciada; desempeño y modos pendientes de verificar.', title);
  if (/\b4K\b|\b8K\b/.test(n)) warnings.push('No inferir resolución nativa a partir de 4K/8K en el título.');
  if (/\bUNIVERSAL\b/.test(n)) warnings.push('Universal es una denominación comercial; no confirma compatibilidad con todos los equipos.');
  if (/\bSEGUNDERO\b|\bSQ\b|ALTA CALIDAD|MODELO (?:GO|FLIP|XTREME|TUNE)/.test(n)) warnings.push('No trasladar especificaciones de una marca conocida por semejanza de nombre.');
  return { code: product.code, facts, warnings, status: facts.some(f => f.detail) ? 'PUBLICADA' : 'BORRADOR', sourceKind: 'CATALOG_NAME', title };
}

module.exports = { catalogFacts, clean, normalized };
