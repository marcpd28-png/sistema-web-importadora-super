import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PHONE_KEYS = new Set(["from", "phone", "waId", "wa_id", "whatsappPhone", "whatsapp_phone"]);

function cleanPhone(value: string | null | undefined) {
  return value?.replace(/[^\d]/g, "") ?? "";
}

function normalizePhone(value: string | null | undefined) {
  const digits = cleanPhone(value);

  if (digits.length < 8) {
    return null;
  }

  if (digits.startsWith("51") && digits.length >= 11) {
    return digits;
  }

  if (digits.length === 9) {
    return `51${digits}`;
  }

  return digits;
}

function extractPhoneFromMetadata(value: Prisma.JsonValue | null, depth = 0): string | null {
  if (!value || depth > 8) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractPhoneFromMetadata(item, depth + 1);
      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  for (const [key, candidate] of Object.entries(value)) {
    if (!PHONE_KEYS.has(key)) {
      continue;
    }

    const normalized = typeof candidate === "string" ? normalizePhone(candidate) : null;
    if (normalized) {
      return normalized;
    }
  }

  for (const candidate of Object.values(value)) {
    const found = extractPhoneFromMetadata(candidate ?? null, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

async function main() {
  const contacts = await prisma.chatContact.findMany({
    select: {
      externalId: true,
      id: true,
      phone: true,
      phoneNormalized: true,
    },
  });

  let updated = 0;
  let recoveredFromMetadata = 0;

  for (const contact of contacts) {
    let normalized = normalizePhone(contact.phone) ?? normalizePhone(contact.externalId);

    if (!normalized) {
      const message = await prisma.chatMessage.findFirst({
        orderBy: { createdAt: "desc" },
        select: { metadata: true },
        where: {
          conversation: { contactId: contact.id },
          direction: "INBOUND",
          metadata: { not: Prisma.JsonNull },
        },
      });

      normalized = extractPhoneFromMetadata(message?.metadata ?? null);

      if (normalized) {
        recoveredFromMetadata += 1;
      }
    }

    if (!normalized) {
      continue;
    }

    const data: Prisma.ChatContactUpdateInput = {};

    if (contact.phoneNormalized !== normalized) {
      data.phoneNormalized = normalized;
    }

    if (!contact.phone) {
      data.phone = normalized;
    }

    if (!Object.keys(data).length) {
      continue;
    }

    await prisma.chatContact.update({
      data,
      where: { id: contact.id },
    });

    updated += 1;
  }

  console.log(`Contactos revisados: ${contacts.length}`);
  console.log(`Contactos actualizados: ${updated}`);
  console.log(`Números recuperados desde metadata: ${recoveredFromMetadata}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
