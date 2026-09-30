import { confirmQuotationResponse } from "@/lib/facturador/quotation-confirmation";
import { after, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { FacturadorClient, getFacturadorConfig } from "@/lib/facturador/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadAndSaveQuotePdf } from "@/lib/pdf-sync";
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

export const maxDuration = 120;

const DELIVERY_TYPES = new Set(["DELIVERY", "PICKUP", "PROVINCE"]);

export async function POST(request: Request) {
  let localQuoteId: string | null = null;
  let requestId: string | undefined;
  try {
    const session = await getSession();
    const shopper = session
      ? await prisma.user.findUnique({
          where: { id: session.userId },
          select: { phone: true },
        })
      : null;
    const payload = (await request.json()) as {
      requestId?: string;
      address?: string;
      items?: unknown;
      note?: string;
      deliveryType?: string;
      customer?: QuoteCustomerPayload;
    };

    if (payload.requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId)) {
      return NextResponse.json({ message: "Referencia de solicitud inválida." }, { status: 400 });
    }
    requestId = payload.requestId;
    if (payload.requestId) {
      const existing = await prisma.quote.findUnique({ where: { id: payload.requestId } });
      if (existing) return existingQuoteResponse(existing);
    }
    const customerAddress = payload.customer?.address?.trim() || payload.address?.trim() || null;
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

    const deliveryType = payload.deliveryType?.trim() || "DELIVERY";
    if (!DELIVERY_TYPES.has(deliveryType)) {
      return NextResponse.json({ message: "Selecciona cómo recibirás tu pedido." }, { status: 400 });
    }

    if (deliveryType !== "PICKUP" && !customerAddress) {
      return NextResponse.json({ message: "Ingresa la dirección o ciudad de entrega." }, { status: 400 });
    }

    const customerName = payload.customer?.name?.trim() || session?.name?.trim() || "";
    const customerPhone = payload.customer?.phone?.trim() || shopper?.phone?.trim() || "";
    const customerEmail = payload.customer?.email?.trim() || session?.email?.trim() || null;
    const documentType = payload.customer?.documentType?.trim() || null;
    const documentNumber = payload.customer?.documentNumber?.trim() || null;

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
        AND: [buildSellableProductWhere()],
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
      const client = new FacturadorClient({ ...getFacturadorConfig(), maxRetries: 0, timeoutMs: 10000 });
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
        id: payload.requestId,
        currencySymbol: settings.currencySymbol,
        customerAddress,
        deliveryType,
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
    const client = new FacturadorClient({ ...getFacturadorConfig(), maxRetries: 0, timeoutMs: 10000 });
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

    const { quoteNumber, externalId: quoteExternalId } = confirmQuotationResponse(result.response);
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
    // PDF retrieval must never change an already-confirmed ERP registration.
    if (quoteExternalId && quoteNumber) after(async () => {
      try {
        const pdfUrl = await downloadAndSaveQuotePdf(quoteExternalId, quoteNumber);
        if (pdfUrl) await prisma.quote.update({ where: { id: localQuote.id }, data: { pdfUrl } });
      } catch { console.warn("[erp-quote] PDF retrieval failed after confirmed registration"); }
    });
    return NextResponse.json({
      localQuoteId: localQuote.id, message: messageBase, quoteNumber,
      statusSteps, whatsappHref, warnings,
    });
  } catch (error) {
    if (requestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.quote.findUnique({ where: { id: requestId } });
      if (existing) return existingQuoteResponse(existing);
    }
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
import { buildSellableProductWhere } from "@/lib/store-shared";

function existingQuoteResponse(quote: { id: string; status: string; quoteNumber: string | null; erpExternalId: string | null; whatsappHref: string | null; statusSteps: unknown }) {
  if (quote.status === "ERP_REGISTERED" && quote.quoteNumber && quote.erpExternalId) {
    return NextResponse.json({ localQuoteId: quote.id, quoteNumber: quote.quoteNumber,
      message: `Cotización ${quote.quoteNumber} registrada en el ERP.`, whatsappHref: quote.whatsappHref, statusSteps: quote.statusSteps });
  }
  return NextResponse.json({ localQuoteId: quote.id,
    message: "Esta solicitud ya fue recibida. Su registro no está confirmado; consulta con un asesor antes de repetirla." }, { status: 409 });
}
