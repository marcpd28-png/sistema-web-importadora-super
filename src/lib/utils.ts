import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatCurrency(value: number, currencySymbol = "S/") {
  return `${currencySymbol} ${value.toFixed(2)}`;
}

export function formatRepeatedPriceRow(
  price: number,
  currencySymbol = "S/",
  qtyLabel?: string,
) {
  const formattedPrice = formatCurrency(price, currencySymbol);

  return qtyLabel ? `${qtyLabel} ${formattedPrice}` : formattedPrice;
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("es-PE", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function cleanPhoneNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

export const PUBLIC_MESSENGER_URL = "https://m.me/importacionessuperoficial";

export function normalizePhoneNumber(phone: string | null | undefined) {
  const digits = phone ? cleanPhoneNumber(phone) : "";

  if (!digits) {
    return null;
  }

  if (digits.startsWith("51")) {
    return digits;
  }

  if (digits.length === 9) {
    return `51${digits}`;
  }

  return digits;
}

export function isTruthy(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}
