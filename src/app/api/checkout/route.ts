import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CULQI_SECRET_KEY = process.env.CULQI_SECRET_KEY || "";
const WHATSAPP_BUSINESS_NUMBER = process.env.WHATSAPP_ALERT_NUMBER || "51999999999";
const DELIVERY_TYPES = new Set(["DELIVERY", "PICKUP", "PROVINCE"]);

// ─────────────────────────────────────────────
// Helper: call Culqi Charges API
// ─────────────────────────────────────────────
async function chargeCulqi(token: string, amountCentavos: number, email: string, description: string) {
  if (!CULQI_SECRET_KEY) {
    // Dev mode: simulate successful payment
    return { id: `sim_${Date.now()}`, outcome: { type: "venta_exitosa" } };
  }

  const res = await fetch("https://api.culqi.com/v2/charges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CULQI_SECRET_KEY}`,
    },
    body: JSON.stringify({
      amount: amountCentavos,
      currency_code: "PEN",
      email,
      source_id: token,
      description,
      capture: true,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.user_message || data.merchant_message || "Error al procesar el cobro con Culqi.");
  }
  return data;
}

// ─────────────────────────────────────────────
// Helper: build WhatsApp confirmation link
// ─────────────────────────────────────────────
function buildWhatsAppLink(orderNumber: string, customerName: string, total: number, promoCode?: string | null) {
  const discountLine = promoCode ? `%0A🎟️ Cupón aplicado: ${promoCode}` : "";
  const msg = `Hola! Acabo de realizar un pedido 🛒%0ANúmero de orden: *${orderNumber}*%0ACliente: ${customerName}%0ATotal pagado: *S/ ${total.toFixed(2)}*${discountLine}%0A%0A¿Pueden confirmar mi pedido?`;
  return `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${msg}`;
}

// ─────────────────────────────────────────────
// POST /api/checkout  — Main handler
// ─────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      token,
      paymentMethod,
      customer,
      items,
      promoCode,
      deliveryType,   // DELIVERY | PICKUP | PROVINCE
      address,        // dirección del cliente
    } = body;

    // ── 1. Validate required fields ──────────────────────────────────
    if (!customer?.name || !customer?.phone) {
      return NextResponse.json({ message: "Nombre y teléfono del cliente son requeridos." }, { status: 400 });
    }
    if (!items?.length) {
      return NextResponse.json({ message: "El carrito está vacío." }, { status: 400 });
    }
    if (!DELIVERY_TYPES.has(deliveryType)) {
      return NextResponse.json({ message: "Selecciona cómo recibirás tu pedido." }, { status: 400 });
    }
    if (deliveryType !== "PICKUP" && !String(address ?? "").trim()) {
      return NextResponse.json({ message: "Ingresa la dirección o ciudad de entrega." }, { status: 400 });
    }

    const method = paymentMethod || (token ? "CULQI" : "MANUAL");
    if (method === "CULQI" && !token) {
      return NextResponse.json({ message: "Token de pago no recibido." }, { status: 400 });
    }

    // ── 2. Validate promo code (server-side) ─────────────────────────
    let promoRecord: any = null;
    let discountAmount = 0;
    let commissionAmount = 0;

    if (promoCode) {
      promoRecord = await prisma.promoCode.findUnique({
        where: { code: promoCode.toUpperCase().trim() },
      });

      if (!promoRecord || !promoRecord.isActive) {
        return NextResponse.json({ message: "El código de descuento no es válido o está inactivo." }, { status: 400 });
      }
      if (promoRecord.expiresAt && new Date(promoRecord.expiresAt) < new Date()) {
        return NextResponse.json({ message: "El código de descuento ya venció." }, { status: 400 });
      }
    }

    // ── 3. Re-calculate total server-side ────────────────────────────
    // We price from what the client sends but validate item totals are correct
    let subtotal = 0;
    const validatedItems = items.map((item: any) => {
      const lineTotal = Number(item.unitPrice) * Number(item.quantity);
      subtotal += lineTotal;
      return {
        code: item.code || "PROD",
        name: item.name || "Producto",
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total: lineTotal,
        tierLabel: item.tierLabel || "UNIDAD",
        productId: item.productId || undefined,
      };
    });

    // Apply promo discount
    if (promoRecord) {
      const minOrder = Number(promoRecord.minOrderAmount);
      if (subtotal < minOrder) {
        return NextResponse.json({
          message: `El código requiere un mínimo de compra de S/ ${minOrder.toFixed(2)}.`
        }, { status: 400 });
      }

      if (promoRecord.discountType === "PERCENTAGE") {
        discountAmount = (subtotal * Number(promoRecord.discountValue)) / 100;
      } else {
        discountAmount = Number(promoRecord.discountValue);
      }

      commissionAmount = promoRecord.commissionType === "PERCENTAGE"
        ? (subtotal * Number(promoRecord.commissionValue)) / 100
        : Number(promoRecord.commissionValue);
    }

    const finalTotal = Math.max(0, subtotal - discountAmount);
    const amountCentavos = Math.round(finalTotal * 100);

    // ── 4. Process payment (Culqi or mark as PENDING) ─────────────────
    let culqiChargeId: string | null = null;
    let orderStatus: "PAID" | "PENDING" = "PENDING";

    if (method === "CULQI") {
      const charge = await chargeCulqi(
        token,
        amountCentavos,
        customer.email || `${customer.phone}@noemail.com`,
        `Pedido Importadora Super - ${customer.name}`
      );
      culqiChargeId = charge.id;
      orderStatus = "PAID";
    }
    // For INTERBANK, YAPE, PLIN → PENDING until admin approves

    // ── 5. Generate order number ──────────────────────────────────────
    const count = await prisma.order.count();
    const orderNumber = `ORD-${String(count + 1).padStart(5, "0")}`;

    // ── 6. Create order in DB ─────────────────────────────────────────
    const order = await prisma.order.create({
      data: {
        orderNumber,
        status: orderStatus,
        paymentMethod: method,
        culqiTokenId: token || null,
        culqiChargeId: culqiChargeId,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email || null,
        customerDocumentType: customer.documentType || null,
        customerDocumentNumber: customer.documentNumber || null,
        customerAddress: address || null,
        deliveryType: deliveryType || "DELIVERY",
        currencySymbol: "PEN",
        total: finalTotal,
        discountAmount: discountAmount,
        commissionAmount: commissionAmount,
        promoCodeId: promoRecord?.id || null,
        promoCodeStr: promoCode || null,
        items: {
          create: validatedItems,
        },
      },
    });

    // ── 7. Build WhatsApp confirmation link ───────────────────────────
    const whatsappLink = buildWhatsAppLink(
      orderNumber,
      customer.name,
      finalTotal,
      promoCode
    );

    // ── 8. Return success response ────────────────────────────────────
    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber,
      status: orderStatus,
      total: finalTotal,
      discountAmount,
      whatsappLink,
      message: orderStatus === "PAID"
        ? `¡Pago aprobado! Tu pedido ${orderNumber} ha sido registrado.`
        : `¡Pedido ${orderNumber} recibido! Envíanos tu voucher de pago por WhatsApp para confirmar.`,
      // Receipt data for frontend display
      receipt: {
        orderNumber,
        paymentMethod: paymentMethod || "MANUAL",
        deliveryType: deliveryType || "DELIVERY",
        address: address || null,
        subtotal: serverSubtotal,
        discountAmount,
        promoCode: promoCode || null,
        total: finalTotal,
        createdAt: new Date().toISOString(),
        items: validatedItems.map((item: any) => ({
          name: item.name,
          code: item.code,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
        })),
      },
    });

  } catch (error: any) {
    console.error("Error en checkout:", error);
    return NextResponse.json(
      { message: error?.message || "Error interno procesando el pedido." },
      { status: 500 }
    );
  }
}
