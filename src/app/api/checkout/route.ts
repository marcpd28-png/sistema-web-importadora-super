import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, customer, items, amount, currency } = body;

    if (!token) {
      return NextResponse.json({ message: "Token de pago no recibido." }, { status: 400 });
    }

    // AQUI: Lógica de servidor para cobrar con Culqi usando SK_TEST
    // Como estamos simulando para local sin llaves, asumimos que el cobro es exitoso.
    
    // Crear la orden en la BD
    const order = await prisma.order.create({
      data: {
        status: "PAID",
        paymentMethod: "CULQI",
        culqiTokenId: token,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerDocumentType: customer.documentType || null,
        customerDocumentNumber: customer.documentNumber || null,
        currencySymbol: currency || "S/",
        total: amount / 100, // Culqi manda en centimos
        items: {
          create: items.map((item: any) => ({
            code: item.code,
            name: item.name || "Producto",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            tierLabel: item.tierLabel || "Regular",
          })),
        },
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      message: "Pago procesado exitosamente.",
    });
  } catch (error) {
    console.error("Error en checkout:", error);
    return NextResponse.json(
      { message: "Error interno procesando el pago." },
      { status: 500 }
    );
  }
}
