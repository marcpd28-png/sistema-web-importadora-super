export const BLOCKED_PUBLIC_PRODUCT_CODES = ["N00", "COMISION"];
const BLOCKED_PUBLIC_PRODUCT_CODES_SET = new Set(BLOCKED_PUBLIC_PRODUCT_CODES);

function normalizeBlockedProductCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function isBlockedPublicProductCode(value: string | null | undefined) {
  return BLOCKED_PUBLIC_PRODUCT_CODES_SET.has(normalizeBlockedProductCode(value));
}
