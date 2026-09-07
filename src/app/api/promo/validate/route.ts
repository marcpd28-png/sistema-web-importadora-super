import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, cartTotal } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ success: false, message: "Código inválido" }, { status: 400 });
    }

    const promoCode = await prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!promoCode) {
      return NextResponse.json({ success: false, message: "El código no existe" }, { status: 404 });
    }

    if (!promoCode.isActive) {
      return NextResponse.json({ success: false, message: "El código ya no está activo" }, { status: 400 });
    }

    if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
      return NextResponse.json({ success: false, message: "El código ha expirado" }, { status: 400 });
    }

    if (cartTotal < Number(promoCode.minOrderAmount)) {
      return NextResponse.json({ 
        success: false, 
        message: `Este código requiere una compra mínima de S/ ${Number(promoCode.minOrderAmount).toFixed(2)}` 
      }, { status: 400 });
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (promoCode.discountType === "PERCENTAGE") {
      discountAmount = (cartTotal * Number(promoCode.discountValue)) / 100;
    } else {
      discountAmount = Number(promoCode.discountValue);
    }

    // Protection: never discount more than the cart itself
    if (discountAmount > cartTotal) {
      discountAmount = cartTotal;
    }

    return NextResponse.json({
      success: true,
      promoCodeId: promoCode.id,
      code: promoCode.code,
      discountAmount,
      newTotal: cartTotal - discountAmount,
    });
  } catch (error) {
    console.error("[PROMO_VALIDATE_ERROR]", error);
    return NextResponse.json({ success: false, message: "Error interno validando el cupón" }, { status: 500 });
  }
}
