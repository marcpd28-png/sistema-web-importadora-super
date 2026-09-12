import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  salesStatePatchSchema,
  serializeSalesState,
} from "@/lib/conversation-sales-state";

function isAuthorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;

  if (!expected) {
    console.error(
      "N8N_INTERNAL_API_KEY is not configured.",
    );

    return false;
  }

  return (
    request.headers.get("x-internal-api-key") === expected
  );
}

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Unauthorized",
    },
    {
      status: 401,
    },
  );
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return unauthorized();
    }

    const url = new URL(request.url);

    const conversationId = url.searchParams
      .get("conversationId")
      ?.trim();

    if (!conversationId) {
      return NextResponse.json(
        {
          ok: false,
          error: "conversationId is required",
        },
        {
          status: 400,
        },
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        status: true,
        botEnabled: true,
        assignedUserId: true,
        salesState: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        {
          ok: false,
          error: "Conversation not found",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,

      conversation: {
        id: conversation.id,
        status: conversation.status,
        botEnabled: conversation.botEnabled,
        assignedUserId: conversation.assignedUserId,
      },

      salesState: conversation.salesState
        ? serializeSalesState(conversation.salesState)
        : null,
    });
  } catch (error: unknown) {
    console.error(
      "GET conversation sales state failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return unauthorized();
    }

    const body = await request.json();
    const input = salesStatePatchSchema.parse(body);

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: input.conversationId,
      },
      select: {
        id: true,
        botEnabled: true,
        status: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        {
          ok: false,
          error: "Conversation not found",
        },
        {
          status: 404,
        },
      );
    }

    if (input.reset) {
      const state =
        await prisma.conversationSalesState.upsert({
          where: {
            conversationId: input.conversationId,
          },

          create: {
            conversationId: input.conversationId,
            stage: "AWAITING_PRODUCT_QUERY",
          },

          update: {
            stage: "AWAITING_PRODUCT_QUERY",
            category: null,
            brand: null,
            purchaseIntent: false,
            shownProducts: Prisma.JsonNull,
            selectedProductCode: null,
            quantity: null,
            unitPrice: null,
            priceTier: null,
            total: null,
            customerData: Prisma.JsonNull,
            documentData: Prisma.JsonNull,
            deliveryData: Prisma.JsonNull,
            paymentData: Prisma.JsonNull,
            orderNumber: null,
          },
        });

      return NextResponse.json({
        ok: true,
        reset: true,
        salesState: serializeSalesState(state),
      });
    }

    const {
      conversationId,
      reset: _reset,
      ...patch
    } = input;

    const data: Prisma.ConversationSalesStateUpdateInput = {};

    if (patch.stage !== undefined) {
      data.stage = patch.stage;
    }

    if (patch.category !== undefined) {
      data.category = patch.category;
    }

    if (patch.brand !== undefined) {
      data.brand = patch.brand;
    }

    if (patch.purchaseIntent !== undefined) {
      data.purchaseIntent = patch.purchaseIntent;
    }

    if (patch.shownProducts !== undefined) {
      data.shownProducts =
        patch.shownProducts === null
          ? Prisma.JsonNull
          : patch.shownProducts;
    }

    if (patch.selectedProductCode !== undefined) {
      data.selectedProductCode =
        patch.selectedProductCode;
    }

    if (patch.quantity !== undefined) {
      data.quantity = patch.quantity;
    }

    if (patch.unitPrice !== undefined) {
      data.unitPrice = patch.unitPrice;
    }

    if (patch.priceTier !== undefined) {
      data.priceTier = patch.priceTier;
    }

    if (patch.total !== undefined) {
      data.total = patch.total;
    }

    if (patch.customerData !== undefined) {
      data.customerData =
        patch.customerData === null
          ? Prisma.JsonNull
          : (patch.customerData as Prisma.InputJsonValue);
    }

    if (patch.documentData !== undefined) {
      data.documentData =
        patch.documentData === null
          ? Prisma.JsonNull
          : (patch.documentData as Prisma.InputJsonValue);
    }

    if (patch.deliveryData !== undefined) {
      data.deliveryData =
        patch.deliveryData === null
          ? Prisma.JsonNull
          : (patch.deliveryData as Prisma.InputJsonValue);
    }

    if (patch.paymentData !== undefined) {
      data.paymentData =
        patch.paymentData === null
          ? Prisma.JsonNull
          : (patch.paymentData as Prisma.InputJsonValue);
    }

    if (patch.orderNumber !== undefined) {
      data.orderNumber = patch.orderNumber;
    }

    const state =
      await prisma.conversationSalesState.upsert({
        where: {
          conversationId,
        },

        create: {
          conversationId,
          stage:
            patch.stage ??
            "AWAITING_PRODUCT_QUERY",

          category:
            patch.category ?? null,

          brand:
            patch.brand ?? null,

          purchaseIntent:
            patch.purchaseIntent ?? false,

          shownProducts:
            patch.shownProducts ?? undefined,

          selectedProductCode:
            patch.selectedProductCode ?? null,

          quantity:
            patch.quantity ?? null,

          unitPrice:
            patch.unitPrice ?? null,

          priceTier:
            patch.priceTier ?? null,

          total:
            patch.total ?? null,

          customerData:
            patch.customerData === null
              ? Prisma.JsonNull
              : patch.customerData === undefined
                ? undefined
                : (patch.customerData as Prisma.InputJsonValue),

          documentData:
            patch.documentData === null
              ? Prisma.JsonNull
              : patch.documentData === undefined
                ? undefined
                : (patch.documentData as Prisma.InputJsonValue),

          deliveryData:
            patch.deliveryData === null
              ? Prisma.JsonNull
              : patch.deliveryData === undefined
                ? undefined
                : (patch.deliveryData as Prisma.InputJsonValue),

          paymentData:
            patch.paymentData === null
              ? Prisma.JsonNull
              : patch.paymentData === undefined
                ? undefined
                : (patch.paymentData as Prisma.InputJsonValue),

          orderNumber:
            patch.orderNumber ?? null,
        },

        update: data,
      });

    return NextResponse.json({
      ok: true,

      conversation: {
        id: conversation.id,
        status: conversation.status,
        botEnabled: conversation.botEnabled,
      },

      salesState: serializeSalesState(state),
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request payload",
          details: error.issues,
        },
        {
          status: 400,
        },
      );
    }

    console.error(
      "PATCH conversation sales state failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      {
        status: 500,
      },
    );
  }
}
