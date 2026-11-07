import { prisma } from "./prisma";
import { PUBLIC_MESSENGER_URL } from "./utils";

export type MessengerReferral = {
  href: string;
  usedFallback: boolean;
};

function isOfficialMessengerUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "m.me" || host === "www.messenger.com" || host === "messenger.com" || host === "www.facebook.com" || host === "facebook.com";
  } catch {
    return false;
  }
}

export async function getConfiguredMessengerUrl() {
  try {
    // Reading through JSON keeps the fallback usable during the rolling
    // deployment immediately before the new column is migrated.
    const rows = await prisma.$queryRaw<Array<{ messengerUrl: string | null }>>`
      SELECT to_jsonb(settings)->>'messengerUrl' AS "messengerUrl"
      FROM "StoreSettings" AS settings
      WHERE settings.id = 1
    `;

    return rows[0]?.messengerUrl || PUBLIC_MESSENGER_URL;
  } catch {
    return PUBLIC_MESSENGER_URL;
  }
}

export function buildMessengerReferralUrl(messengerUrl: string, reference: string) {
  return buildMessengerReferral(messengerUrl, reference).href;
}

/** Build only a trusted Messenger/Facebook handoff. A malformed or unrelated
 * configuration never becomes a customer-facing redirect. */
export function buildMessengerReferral(messengerUrl: string | null | undefined, reference: string): MessengerReferral {
  if (messengerUrl && isOfficialMessengerUrl(messengerUrl)) {
    const url = new URL(messengerUrl);
    url.searchParams.set("ref", reference);
    return { href: url.toString(), usedFallback: false };
  }
  const url = new URL(PUBLIC_MESSENGER_URL);
  url.searchParams.set("ref", reference);
  return { href: url.toString(), usedFallback: true };
}
