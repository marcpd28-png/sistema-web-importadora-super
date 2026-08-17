import { after, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { FacturadorClient } from "@/lib/facturador/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeQuoteLineInputs,
  prepareQuoteLines,
  QuoteLineValidationError,
} from "@/lib/quote-pricing";
import { getStoreSettings } from "@/lib/store";
import { cleanWhatsappNumber, formatCurrency, PUBLIC_WHATSAPP_NUMBER } from "@/lib/utils";

type QuoteRequestItem = {
  code: string;
  quantity: number;
};

type QuoteCustomerPayload = {
  name?: string;
  phone?: string;
  email?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  address?: string | null;
};

export async function POST(request: Request) {
  let localQuoteId: string | null = null;
  try {
    const session = await getSession();
    const shopper = session
      ? await prisma.user.findUnique({
          where: { id: session.userId },
          select: { phone: true },
        })
      : null;
    const payload = (await request.json()) as {
      items?: unknown;
      note?: string;
      customer?: QuoteCustomerPayload;
    };

    let requestedItems: QuoteRequestItem[];

    try {
      requestedItems = normalizeQuoteLineInputs(payload.items);
    } catch (error) {
      if (error instanceof QuoteLineValidationError) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }

      throw error;
    }

    if (!requestedItems.length) {
      return NextResponse.json({ message: "No hay items para cotizar." }, { status: 400 });
    }

    const customerName = payload.customer?.name?.trim() || session?.name?.trim() || "";
    const customerPhone = payload.customer?.phone?.trim() || shopper?.phone?.trim() || "";
    const customerEmail = payload.customer?.email?.trim() || session?.email?.trim() || null;
    const documentType = payload.customer?.documentType?.trim() || null;
    const documentNumber = payload.customer?.documentNumber?.trim() || null;
    const customerAddress = payload.customer?.address?.trim() || null;

    if (customerName.length < 3) {
      return NextResponse.json(
        { message: "Ingresa el nombre o razón social del cliente para registrar la cotización." },
        { status: 400 },
      );
    }

    if (customerPhone.length < 6) {
      return NextResponse.json(
        { message: "Ingresa un teléfono de contacto válido para registrar la cotización." },
        { status: 400 },
      );
    }

    if (Boolean(documentType) !== Boolean(documentNumber)) {
      return NextResponse.json(
        { message: "Si ingresas documento, completa también el tipo y el número." },
        { status: 400 },
      );
    }

    const catalogProducts = await prisma.product.findMany({
      where: {
        code: {
          in: requestedItems.map((item) => item.code),
        },
      },
      select: {
        boxPrice: true,
        code: true,
        externalCode: true,
        externalId: true,
        id: true,
        isVisible: true,
        name: true,
        stockUnits: true,
        unitLabel: true,
        unitPrice: true,
        unitsPerBox: true,
        wholesaleMinQty: true,
        wholesalePrice: true,
      },
    });

    // Real-time stock check against the ERP to prevent overselling
    try {
      const client = new FacturadorClient();
      await Promise.all(
        catalogProducts.map(async (product) => {
          const erpProduct = await client.getProductRealTime(product.code, product.externalId);
          if (erpProduct) {
            const rawStock = erpProduct.stock ?? erpProduct.stock_units ?? erpProduct.quantity ?? 0;
            const erpStock = Math.max(0, Math.floor(Number(rawStock)));
            
            // If database stock is out of sync, update in background and override local check
            if (product.stockUnits !== erpStock) {
              prisma.product.update({
                where: { id: product.id },
                data: { stockUnits: erpStock, isVisible: erpStock > 0 }
              }).catch(() => null);
              
              product.stockUnits = erpStock;
            }
          }
        })
      );
    } catch (erpError) {
      console.warn("[ERP quote validation] Error al consultar stock en tiempo real del ERP, usando base de datos local:", erpError);
    }

    const items = prepareQuoteLines({
      requestedItems,
      products: catalogProducts.map((product) => ({
        ...product,
        boxPrice: product.boxPrice === null ? null : Number(product.boxPrice),
        unitPrice: Number(product.unitPrice),
        wholesalePrice:
          product.wholesalePrice === null ? null : Number(product.wholesalePrice),
      })),
    });
    const settings = await getStoreSettings();
    const note = payload.note ?? "Cotización generada desde la tienda virtual.";
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const localQuote = await prisma.quote.create({
      data: {
        currencySymbol: settings.currencySymbol,
        customerAddress,
        customerDocumentNumber: documentNumber,
        customerDocumentType: documentType,
        customerEmail,
        customerName,
        customerPhone,
        note,
        status: "PENDING",
        total,
        userId: session?.userId ?? null,
        items: {
          create: items.map((item) => ({
            code: item.code,
            externalId: item.externalId,
            name: item.name,
            productId: item.productId,
            quantity: item.quantity,
            tierLabel: item.tierLabel,
            total: item.total,
            unitPrice: item.unitPrice,
          })),
        },
      },
    });
    localQuoteId = localQuote.id;
    const quoteWhatsappNumber = cleanWhatsappNumber(PUBLIC_WHATSAPP_NUMBER);
    const queuedWhatsappHref = buildAdvisorWhatsappHref({
      businessName: settings.businessName,
      currencySymbol: settings.currencySymbol,
      customerName,
      quoteNumber: null,
      advisorPhone: quoteWhatsappNumber,
      total,
      items,
    });

    const queuedStatusSteps = [
      {
        status: "success" as const,
        text: "Cotización recibida. Se registrará en el ERP en segundo plano.",
      },
      {
        status: "success" as const,
        text: "Te contactaremos vía WhatsApp.",
      },
    ];

    after(async () => {
      try {
        const client = new FacturadorClient();
        const result = await client.createQuotation({
          customer: {
            address: customerAddress,
            documentNumber,
            documentType,
            email: customerEmail,
            name: customerName,
            phone: customerPhone,
          },
          items,
          note,
        });

        const quoteNumber = getQuoteNumber(result.response);
        const quoteExternalId = getQuoteExternalId(result.response);
        const whatsappHref = buildAdvisorWhatsappHref({
          businessName: settings.businessName,
          currencySymbol: settings.currencySymbol,
          customerName,
          quoteNumber,
          advisorPhone: quoteWhatsappNumber,
          total,
          items,
        });
        const warnings = result.warnings.filter(Boolean);
        const messageBase = quoteNumber
          ? `Cotización ${quoteNumber} registrada en el ERP.`
          : "Cotización registrada en el ERP.";
        const customerModeLabel =
          result.customerMode === "created"
            ? "Cliente creado en ERP."
            : result.customerMode === "existing"
              ? "Cliente vinculado al registro existente."
              : "Se usó el cliente genérico del ERP.";
        const statusSteps = [
          {
            status: "success" as const,
            text: messageBase,
          },
          {
            status: result.customerMode === "default" ? ("warning" as const) : ("success" as const),
            text: customerModeLabel,
          },
          ...warnings.map(
            (warning) =>
              ({
                status: "warning" as const,
                text: warning,
              }),
          ),
        ];

        await prisma.quote.update({
          where: { id: localQuote.id },
          data: {
            erpCustomerId: result.customerId,
            erpCustomerMode: result.customerMode,
            erpExternalId: quoteExternalId,
            quoteNumber,
            status: "ERP_REGISTERED",
            statusSteps: toJson(statusSteps),
            whatsappHref,
          },
        });
      } catch (error) {
        if (localQuoteId) {
          await prisma.quote
            .update({
              where: { id: localQuoteId },
              data: {
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : "No se pudo registrar la cotización en el ERP.",
                status: "ERROR",
                statusSteps: toJson([
                  {
                    status: "error",
                    text:
                      error instanceof Error
                        ? error.message
                        : "No se pudo registrar la cotización en el ERP.",
                  },
                ]),
              },
            })
            .catch(() => null);
        }
      }
    });

    return NextResponse.json({
      localQuoteId: localQuote.id,
      message: "Cotización recibida. La estamos registrando en el ERP.",
      quoteNumber: null,
      response: null,
      statusSteps: queuedStatusSteps,
      whatsappHref: queuedWhatsappHref,
      warnings: [],
    });
  } catch (error) {
    if (localQuoteId) {
      await prisma.quote
        .update({
          where: { id: localQuoteId },
          data: {
            errorMessage:
              error instanceof Error
                ? error.message
                : "No se pudo registrar la cotización en el ERP.",
            status: "ERROR",
          },
        })
        .catch(() => null);
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la cotización en el ERP.",
      },
      { status: 500 },
    );
  }
}

function getQuoteNumber(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  for (const candidate of [record.number_full, record.number, record.identifier]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (record.data && typeof record.data === "object") {
    return getQuoteNumber(record.data);
  }

  return null;
}

function getQuoteExternalId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  for (const candidate of [record.external_id, record.externalId]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (record.data && typeof record.data === "object") {
    return getQuoteExternalId(record.data);
  }

  return null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizeCustomerWhatsappNumber(value: string) {
  const digits = cleanWhatsappNumber(value);

  if (digits.startsWith("51") && digits.length >= 11) {
    return digits;
  }

  if (digits.length === 9) {
    return `51${digits}`;
  }

  return digits;
}

function buildAdvisorWhatsappHref(input: {
  businessName: string;
  currencySymbol: string;
  customerName: string;
  advisorPhone: string;
  quoteNumber: string | null;
  total: number;
  items: PreparedCustomerWhatsappItem[];
}) {
  const phone = normalizeCustomerWhatsappNumber(input.advisorPhone);

  if (!phone || phone.length < 11) {
    return null;
  }

  const text = [
    `Hola,`,
    input.quoteNumber
      ? `quiero revisar la cotización ${input.quoteNumber} registrada en ${input.businessName}.`
      : `quiero revisar mi cotización registrada en ${input.businessName}.`,
    "",
    `Cliente: ${input.customerName}`,
    ...input.items.map(
      (item) =>
        `- ${item.name} (${item.code}) x${item.quantity} · ${formatCurrency(item.unitPrice * item.quantity, input.currencySymbol)}`,
    ),
    "",
    `Total referencial: ${formatCurrency(input.total, input.currencySymbol)}`,
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

type PreparedCustomerWhatsappItem = QuoteRequestItem & {
  name: string;
  unitPrice: number;
};
