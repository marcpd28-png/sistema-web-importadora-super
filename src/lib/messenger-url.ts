import { prisma } from "./prisma";
import { PUBLIC_MESSENGER_URL } from "./utils";

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
  try {
    const url = new URL(messengerUrl);
    url.searchParams.set("ref", reference);
    return url.toString();
  } catch {
    const url = new URL(PUBLIC_MESSENGER_URL);
    url.searchParams.set("ref", reference);
    return url.toString();
  }
}
