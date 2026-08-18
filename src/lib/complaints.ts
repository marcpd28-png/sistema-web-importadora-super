import { prisma } from "./prisma";
import type { ComplaintStatus } from "@prisma/client";
import { calculateExpiryDate } from "./business-days";

type ComplaintContact = {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  sheetNumber: string;
};

/**
 * Normaliza el teléfono para enlaces de WhatsApp agregando prefijo de Perú (51) si es de 9 dígitos.
 */
export function normalizeComplaintPhone(phone: string | null | undefined) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");

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

/**
 * Genera el siguiente número de hoja correlativo anual de forma segura
 */
export async function generateNextSheetNumber(year: number): Promise<{
  sheetNumber: string;
  serialNumber: number;
}> {
  // Bucle de reintento simple para mitigar condiciones de carrera concurrentes
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      const latestComplaint = await prisma.complaint.findFirst({
        where: { year },
        orderBy: { serialNumber: "desc" },
        select: { serialNumber: true },
      });

      const nextSerial = (latestComplaint?.serialNumber ?? 0) + 1;
      const sheetNumber = `LR-${year}-${String(nextSerial).padStart(6, "0")}`;

      return {
        sheetNumber,
        serialNumber: nextSerial,
      };
    } catch (error) {
      attempts += 1;
      if (attempts >= maxAttempts) {
        throw error;
      }
      // Pequeña espera asíncrona antes de reintentar
      await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
    }
  }

  throw new Error("No se pudo generar un número correlativo único.");
}

/**
 * Redacta el cuerpo de respuesta en texto plano
 */
export function buildComplaintResponseText(input: {
  sheetNumber: string;
  customerName: string;
  type: string;
  reason: string;
  responseText: string;
}) {
  const lines = [
    `Hola ${input.customerName},`,
    "",
    `Hemos registrado la respuesta formal para tu ${input.type.toLowerCase()} con código ${input.sheetNumber}.`,
    `Detalle del motivo: ${input.reason}`,
    "",
    input.responseText.trim(),
    "",
    "Saludos cordiales,",
    "Importaciones Super S.A.C.",
  ];

  return lines.join("\n");
}

/**
 * Genera un enlace mailto para responder por correo
 */
export function buildComplaintEmailHref(
  contact: ComplaintContact,
  responseText: string,
  type: string,
  reason: string,
) {
  if (!contact.customerEmail) {
    return null;
  }

  const body = buildComplaintResponseText({
    sheetNumber: contact.sheetNumber,
    customerName: contact.customerName,
    type,
    reason,
    responseText,
  });

  const params = new URLSearchParams({
    subject: `Respuesta a tu ${type} en Libro de Reclamaciones - ${contact.sheetNumber}`,
    body,
  });

  return `mailto:${contact.customerEmail}?${params.toString()}`;
}

/**
 * Genera un enlace de WhatsApp para enviar la respuesta
 */
export function buildComplaintWhatsappHref(
  contact: ComplaintContact,
  responseText: string,
  type: string,
  reason: string,
) {
  const phone = normalizeComplaintPhone(contact.customerPhone);

  if (!phone) {
    return null;
  }

  const message = buildComplaintResponseText({
    sheetNumber: contact.sheetNumber,
    customerName: contact.customerName,
    type,
    reason,
    responseText,
  });

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
