type BrandableProduct = {
  name: string;
  brand?: string | null;
};

const VERIFIED_BRANDS = [
  ["HARMAN KARDON", "Harman Kardon"],
  ["ANKER SOUNDCORE", "Anker Soundcore"],
  ["SOUNDCORE", "Anker Soundcore"],
  ["TRONSMART", "Tronsmart"],
  ["KAPERH", "Kaperh"],
  ["ZEALOT", "Zealot"],
  ["LIDIMI", "Lidimi"],
  ["SONIVOX", "Sonivox"],
  ["XIAOMI", "Xiaomi"],
  ["BOSSNEY", "Bossney"],
  ["HALION", "Halion"],
  ["AIWA", "Aiwa"],
  ["SONY", "Sony"],
  ["JBL", "JBL"],
] as const;

const GENERIC_BRANDS = new Set([
  "GENERICO",
  "GENÉRICO",
]);

const SPEAKER_EXCLUSIONS = [
  /\bSOPORTE\s+CON\s+PARLANTE\b/i,
  /\bWALKI(?:E)?\s*TALKIE\b/i,
  /\bINTERCOMUNICADOR\b/i,
  /\bBUDS?\b/i,
  /\bAUDIFONOS?\b/i,
  /\bAURICULARES?\b/i,
  /\bHEADPHONES?\b/i,
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function resolveProductBrand(
  product: BrandableProduct,
): string | null {
  const explicitBrand = product.brand?.trim();

  if (explicitBrand) {
    const normalized = normalizeText(explicitBrand);

    if (!GENERIC_BRANDS.has(normalized)) {
      return explicitBrand;
    }
  }

  const name = normalizeText(product.name);

  for (const [needle, label] of VERIFIED_BRANDS) {
    if (name.includes(needle)) {
      return label;
    }
  }

  return null;
}

export function isRelevantSpeaker(product: {
  name: string;
  category?: string | null;
}) {
  const text = normalizeText(
    `${product.name} ${product.category ?? ""}`,
  );

  const looksLikeSpeaker =
    /\bPARLANTES?\b/.test(text) ||
    /\bSPEAKER\b/.test(text);

  if (!looksLikeSpeaker) {
    return false;
  }

  return !SPEAKER_EXCLUSIONS.some((pattern) =>
    pattern.test(text),
  );
}
