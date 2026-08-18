import { NextResponse } from "next/server";
import { z } from "zod";
import { ComplaintType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateNextSheetNumber } from "@/lib/complaints";
import { calculateExpiryDate } from "@/lib/business-days";

const complaintCreateSchema = z.object({
  type: z.enum(["RECLAMO", "QUEJA"]),
  documentType: z.string().trim().min(1),
  documentNumber: z.string().trim().min(3),
  names: z.string().trim().min(2),
  lastNames: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(5),
  address: z.string().trim().min(3),
  department: z.string().trim().min(1),
  province: z.string().trim().min(1),
  district: z.string().trim().min(1),

  isMinor: z.boolean(),
  repNames: z.string().trim().optional().nullable(),
  repDocumentType: z.string().trim().optional().nullable(),
  repDocumentNumber: z.string().trim().optional().nullable(),

  isPurchaseRelated: z.boolean(),
  orderNumber: z.string().trim().optional().nullable(),
  invoiceNumber: z.string().trim().optional().nullable(),
  purchaseDate: z.string().optional().nullable(), // ISO String or null
  productName: z.string().trim().optional().nullable(),
  productBrand: z.string().trim().optional().nullable(),
  productModel: z.string().trim().optional().nullable(),
  productSku: z.string().trim().optional().nullable(),
  productSerial: z.string().trim().optional().nullable(),
  purchaseAmount: z.coerce.number().optional().nullable(),
  purchaseChannel: z.string().trim().optional().nullable(),
  paymentMethod: z.string().trim().optional().nullable(),

  reason: z.string().trim().min(1),
  subReason: z.string().trim().optional().nullable(),
  facts: z.string().trim().min(10).max(3000),
  request: z.string().trim().min(5).max(2000),

  attachments: z.array(z.string()).default([]),
});

const complaintRateWindowMs = 10 * 60 * 1000;
const complaintRateLimit = 6;
const complaintAttempts = new Map<string, { count: number; resetAt: number }>();

function getRequestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function allowComplaintSubmission(request: Request) {
  const fingerprint = getRequestFingerprint(request);
  const now = Date.now();
  const current = complaintAttempts.get(fingerprint);

  if (!current || current.resetAt <= now) {
    complaintAttempts.set(fingerprint, { count: 1, resetAt: now + complaintRateWindowMs });
    return true;
  }

  if (current.count >= complaintRateLimit) {
    return false;
  }

  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    if (!allowComplaintSubmission(request)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Demasiados reclamos en poco tiempo. Intenta nuevamente en unos minutos.",
        },
        { status: 429 },
      );
    }

    const json = await request.json();
    const payload = complaintCreateSchema.parse(json);

    const createdAt = new Date();
    const year = createdAt.getFullYear();

    // Generar correlativo anual único y seguro
    const { sheetNumber, serialNumber } = await generateNextSheetNumber(year);

    // Calcular fecha de vencimiento legal (15 días hábiles de Perú)
    const expiryDate = calculateExpiryDate(createdAt, 15);

    const parsedPurchaseDate = payload.purchaseDate ? new Date(payload.purchaseDate) : null;

    const complaint = await prisma.complaint.create({
      data: {
        sheetNumber,
        serialNumber,
        year,
        documentType: payload.documentType,
        documentNumber: payload.documentNumber,
        names: payload.names,
        lastNames: payload.lastNames,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        department: payload.department,
        province: payload.province,
        district: payload.district,
        isMinor: payload.isMinor,
        repNames: payload.repNames || null,
        repDocumentType: payload.repDocumentType || null,
        repDocumentNumber: payload.repDocumentNumber || null,
        isPurchaseRelated: payload.isPurchaseRelated,
        orderNumber: payload.orderNumber || null,
        invoiceNumber: payload.invoiceNumber || null,
        purchaseDate: parsedPurchaseDate,
        productName: payload.productName || null,
        productBrand: payload.productBrand || null,
        productModel: payload.productModel || null,
        productSku: payload.productSku || null,
        productSerial: payload.productSerial || null,
        purchaseAmount: payload.purchaseAmount || null,
        purchaseChannel: payload.purchaseChannel || null,
        paymentMethod: payload.paymentMethod || null,
        type: payload.type as ComplaintType,
        reason: payload.reason,
        subReason: payload.subReason || null,
        facts: payload.facts,
        request: payload.request,
        expiryDate,
        attachments: payload.attachments,
        status: "NEW",
      },
      select: {
        id: true,
        sheetNumber: true,
        createdAt: true,
        expiryDate: true,
      },
    });

    // TODO: Generación de PDF y envío de correos asíncrono
    // En el futuro, llamaremos a una función para generar y enviar el correo con el PDF aquí

    return NextResponse.json({
      ok: true,
      sheetNumber: complaint.sheetNumber,
      createdAt: complaint.createdAt.toISOString(),
      expiryDate: complaint.expiryDate.toISOString(),
    });
  } catch (error) {
    console.error("Error al registrar reclamo:", error);
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "No se pudo registrar el reclamo.";
    return NextResponse.json(
      {
        ok: false,
        message: message ?? "No se pudo registrar el reclamo.",
      },
      { status: 400 },
    );
  }
}
