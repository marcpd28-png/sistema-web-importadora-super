import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { discoverExactProducts } from "@/lib/product-discovery";
import { buildRouterV2ProductDecision } from "@/lib/router-v2-product-decision";
import { readShownProducts, resolveShownProductReference, shouldResolveShownProductReference } from "@/lib/router-v2-product-reference";
import { determineRouterV2FinalAction } from "@/lib/router-v2-final-action";
import { buildRouterV2DecisionStatePatch } from "@/lib/router-v2-state-transition";
import { shouldPersistRouterV2State } from "@/lib/router-v2-persistence-policy";
import { persistRouterV2State } from "@/lib/router-v2-state-store";
import { resolveCommercialPrice } from "@/lib/router-v2-commercial-price";
import { buildRouterV2ResponsePlan } from "@/lib/router-v2-response-plan";
import { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";
import { analyzeRouterV2Message } from "@/lib/conversation-router-v2";
import { applyRouterV2ContextualSlots } from "@/lib/router-v2-contextual-slots";
import { buildRouterV2MergedContext, buildRouterV2SalesStatePatch } from "@/lib/router-v2-sales-state";
import { serializeSalesState } from "@/lib/conversation-sales-state";

const schema = z.object({
  conversationId: z.string().trim().min(1).max(191),
  content: z.string().max(10000).default(""),
  messageType: z.string().max(40).nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
});

function authorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;

  return Boolean(
    expected &&
      request.headers.get("x-internal-api-key") === expected,
  );
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const input = schema.parse(await request.json());

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: input.conversationId,
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
        { ok: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    const baseAnalysis = analyzeRouterV2Message({
      content: input.content,
      messageType: input.messageType,
      mediaUrl: input.mediaUrl,
    });

    const currentState = conversation.salesState
      ? serializeSalesState(conversation.salesState)
      : null;

    const analysis = applyRouterV2ContextualSlots({
      analysis: baseAnalysis,
      content: input.content,
      stage: currentState?.stage,
    });

    const proposedPatch = buildRouterV2SalesStatePatch(
      analysis,
      currentState,
    );

    const mergedContext = buildRouterV2MergedContext(
      analysis,
      currentState,
    );

    const productResolution =
      analysis.slots.brand && analysis.slots.model
        ? await discoverExactProducts({
            brand: analysis.slots.brand,
            model: analysis.slots.model,
          })
        : null;

    const productDecision =
      buildRouterV2ProductDecision(productResolution);

    const priorShownProducts =
      readShownProducts(currentState?.shownProducts);

    const canResolveProductReference =
      shouldResolveShownProductReference({
        stage: currentState?.stage,
        hasProductResolution: Boolean(productResolution),
        shownProducts: priorShownProducts,
        quantity: analysis.slots.quantity,
        intents: analysis.intents,
      });

    const productReference =
      canResolveProductReference
        ? resolveShownProductReference(
            input.content,
            priorShownProducts,
          )
        : null;


    const nextAction =
      determineRouterV2FinalAction({
        botEnabled: conversation.botEnabled,
        analysisNextAction: analysis.nextAction,
        productDecision,
        productReference,
        canResolveProductReference,
      });

    const proposedStatePatch =
      buildRouterV2DecisionStatePatch({
        basePatch: proposedPatch,
        finalAction: nextAction,
        productDecision,
        productReference,
        quantity: mergedContext.quantity,
        purchaseIntent: mergedContext.purchaseIntent,
      });

    const selectedProductCodeForPricing =
      typeof proposedStatePatch.selectedProductCode === "string"
        ? proposedStatePatch.selectedProductCode
        : proposedStatePatch.selectedProductCode === null
          ? null
          : mergedContext.selectedProductCode;

    const commercialPrice =
      selectedProductCodeForPricing &&
      mergedContext.quantity &&
      mergedContext.quantity > 0
        ? await resolveCommercialPrice(
            selectedProductCodeForPricing,
            mergedContext.quantity,
          )
        : null;

    if (commercialPrice?.status === "READY") {
      proposedStatePatch.unitPrice =
        commercialPrice.unitPrice;
      proposedStatePatch.priceTier =
        commercialPrice.priceTier;
      proposedStatePatch.total =
        commercialPrice.total;

      if (
        !proposedStatePatch.category &&
        commercialPrice.product.category
      ) {
        proposedStatePatch.category =
          commercialPrice.product.category;
      }

      if (
        currentState?.stage === "AWAITING_QUANTITY" ||
        proposedStatePatch.stage === "AWAITING_QUANTITY"
      ) {
        proposedStatePatch.stage =
          "AWAITING_PRICE_CONFIRMATION";
      }
    }

    const shouldPersistState =
      shouldPersistRouterV2State({
        botEnabled: conversation.botEnabled,
        finalAction: nextAction,
        proposedStatePatch,
      });

    const persistedState = shouldPersistState
      ? await persistRouterV2State(
          conversation.id,
          proposedStatePatch,
        )
      : null;

    const responsePlan = buildRouterV2ResponsePlan({
      finalAction: nextAction,
      state: persistedState ?? currentState,
    });

    const responseContext = buildRouterV2ResponseContext({
      customerMessage: input.content,
      responsePlan,
      state: persistedState ?? currentState,
      commercialPrice,
    });

    return NextResponse.json({
      ok: true,

      conversation: {
        id: conversation.id,
        status: conversation.status,
        botEnabled: conversation.botEnabled,
        assignedUserId: conversation.assignedUserId,
      },

      currentState,
      analysis,
      proposedPatch,
      proposedStatePatch,
      shouldPersistState,
      persistedState,
      commercialPrice,
      mergedContext,
      productResolution,
      productDecision,
      productReference,
      nextAction,
      responsePlan,
      responseContext,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request payload",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    console.error("[router-v2] error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 },
    );
  }
}
