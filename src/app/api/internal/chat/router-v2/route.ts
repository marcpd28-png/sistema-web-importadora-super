import { NextResponse } from "next/server";
import { z } from "zod";

import { serializeSalesState } from "@/lib/conversation-sales-state";
import { analyzeRouterV2Message } from "@/lib/conversation-router-v2";
import { prisma } from "@/lib/prisma";
import { discoverExactProducts } from "@/lib/product-discovery";
import { getRouterV2BusinessKnowledge } from "@/lib/router-v2-business-knowledge";
import { resolveRouterV2CatalogFlow } from "@/lib/router-v2-catalog-flow";
import { buildRouterV2OutboundMessages } from "@/lib/router-v2-channel-response";
import { resolveRouterV2CheckoutFlow } from "@/lib/router-v2-checkout-flow";
import { resolveCommercialPrice } from "@/lib/router-v2-commercial-price";
import { applyRouterV2ContextualSlots } from "@/lib/router-v2-contextual-slots";
import { applyRouterV2DeliverySelection } from "@/lib/router-v2-delivery-selection";
import { determineRouterV2FinalAction } from "@/lib/router-v2-final-action";
import {
  createRouterV2PendingOrder,
  extractRouterV2OrderNumber,
  getRouterV2OrderStatus,
  updateRouterV2OrderPaymentMethod,
} from "@/lib/router-v2-order-service";
import { resolveRouterV2PaymentSelection } from "@/lib/router-v2-payment-selection";
import { shouldPersistRouterV2State } from "@/lib/router-v2-persistence-policy";
import { buildRouterV2ProductDecision } from "@/lib/router-v2-product-decision";
import {
  findRouterV2ProductSpecification,
  getRouterV2ProductInformation,
} from "@/lib/router-v2-product-information";
import { detectRouterV2ProductQuestion } from "@/lib/router-v2-product-question";
import {
  readShownProducts,
  resolveShownProductReference,
  shouldResolveShownProductReference,
} from "@/lib/router-v2-product-reference";
import { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";
import { buildRouterV2ResponseDraft } from "@/lib/router-v2-response-draft";
import { buildRouterV2ResponsePlan } from "@/lib/router-v2-response-plan";
import { discoverRouterV2RetailProducts } from "@/lib/router-v2-retail-discovery";
import {
  buildRouterV2MergedContext,
  buildRouterV2SalesStatePatch,
} from "@/lib/router-v2-sales-state";
import { mergeRouterV2StatePatches } from "@/lib/router-v2-state-patch";
import { persistRouterV2State } from "@/lib/router-v2-state-store";
import { buildRouterV2DecisionStatePatch } from "@/lib/router-v2-state-transition";
import { resolveRouterV2TextProduct } from "@/lib/router-v2-text-product-resolver";
import { buildRouterV2VisualDecision } from "@/lib/router-v2-visual-decision";
import { resolveRouterV2VisualProduct } from "@/lib/router-v2-visual-product-resolver";

const visualHintsSchema = z
  .object({
    brand: z.string().trim().max(120).nullable().optional(),
    model: z.string().trim().max(180).nullable().optional(),
    color: z.string().trim().max(80).nullable().optional(),
    code: z.string().trim().max(64).nullable().optional(),
    visibleText: z.array(z.string().trim().max(240)).max(30).optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })
  .nullable()
  .optional();

const schema = z.object({
  conversationId: z.string().trim().min(1).max(191),
  content: z.string().max(10000).default(""),
  messageType: z.string().max(40).nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  visualHints: visualHintsSchema,
});

function authorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;
  return Boolean(
    expected && request.headers.get("x-internal-api-key") === expected,
  );
}

function asStateRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function looksLikeQuestion(content: string) {
  const text = content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return (
    /[?¿]/.test(content) ||
    /^(como|cual|cuales|cuanto|cuanta|cuantos|cuantas|donde|cuando|por que|hacen|tienen|aceptan|puedo|pueden|demora|cuesta|hay)\b/.test(
      text,
    )
  );
}

function looksLikeProductCode(content: string) {
  return /\(?[a-z]\d{2,6}(?:[-_\s][a-z0-9]+)*\)?/i.test(content);
}

function shouldAttemptCheckout(input: {
  stage?: string | null;
  analysisNextAction: string;
  content: string;
  deliveryMethodCandidate: string | null;
  paymentMethodCandidate: string | null;
  messageType?: string | null;
  mediaUrl?: string | null;
  hasProductQuestion: boolean;
  catalogAction: string;
}) {
  const stage = input.stage;
  if (!stage) return false;
  if (input.catalogAction !== "NONE" || input.hasProductQuestion) return false;

  if (stage === "AWAITING_DELIVERY_METHOD") {
    return (
      Boolean(input.deliveryMethodCandidate) ||
      input.analysisNextAction === "CONTINUE_SALES_FLOW"
    );
  }

  if (stage === "AWAITING_PAYMENT_METHOD") {
    return (
      Boolean(input.paymentMethodCandidate) ||
      input.analysisNextAction === "CONTINUE_SALES_FLOW"
    );
  }

  if (stage === "AWAITING_PAYMENT_CONFIRMATION") {
    const isEvidence =
      Boolean(input.mediaUrl) ||
      ["IMAGE", "DOCUMENT"].includes(
        (input.messageType ?? "").toUpperCase(),
      );
    return isEvidence || input.analysisNextAction === "CONTINUE_SALES_FLOW";
  }

  if (stage === "AWAITING_DOCUMENT_TYPE") {
    const exactDocumentChoice = /^(boleta|factura)[.!]?$/i.test(
      input.content.trim(),
    );
    return (
      exactDocumentChoice ||
      input.analysisNextAction === "CONTINUE_SALES_FLOW"
    );
  }

  if (stage === "AWAITING_DELIVERY_DETAILS") {
    return !looksLikeQuestion(input.content);
  }

  return input.analysisNextAction === "CONTINUE_SALES_FLOW";
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
      where: { id: input.conversationId },
      select: {
        id: true,
        status: true,
        botEnabled: true,
        assignedUserId: true,
        salesState: true,
        contact: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    const currentState = conversation.salesState
      ? serializeSalesState(conversation.salesState)
      : null;
    const currentStateRecord = asStateRecord(currentState);

    const baseAnalysis = analyzeRouterV2Message({
      content: input.content,
      messageType: input.messageType,
      mediaUrl: input.mediaUrl,
    });

    const contextualAnalysis = applyRouterV2ContextualSlots({
      analysis: baseAnalysis,
      content: input.content,
      stage: currentState?.stage,
    });

    const analysis = applyRouterV2DeliverySelection({
      analysis: contextualAnalysis,
      content: input.content,
      stage: currentState?.stage,
    });

    const productQuestion = detectRouterV2ProductQuestion(
      input.content,
    );

    const proposedPatch = buildRouterV2SalesStatePatch(
      analysis,
      currentState,
    );

    const mergedContext = buildRouterV2MergedContext(
      analysis,
      currentState,
    );

    const businessKnowledge = await getRouterV2BusinessKnowledge();

    const catalogDecision = resolveRouterV2CatalogFlow({
      analysis,
      content: input.content,
      currentState,
    });

    const retailDiscovery =
      catalogDecision.action === "START_RETAIL_DISCOVERY"
        ? await discoverRouterV2RetailProducts({
            category: mergedContext.category,
            brand: mergedContext.brand,
            query:
              mergedContext.category || mergedContext.brand
                ? null
                : analysis.intents.some((intent) =>
                    ["PRODUCT_SEARCH", "BRAND_SEARCH"].includes(intent),
                  )
                  ? input.content
                  : null,
            take: 4,
          })
        : null;

    const retailStatePatch: Record<string, unknown> = {};
    if (retailDiscovery?.status === "READY") {
      retailStatePatch.stage = "AWAITING_MODEL_SELECTION";
      retailStatePatch.selectedProductCode = null;
      retailStatePatch.shownProducts = retailDiscovery.matches.map(
        (product, index) => ({
          position: index + 1,
          code: product.code,
          name: product.name,
          brand: product.brand,
          slug: product.slug,
          unitPrice: product.unitPrice,
          imageUrl: product.imageUrl,
        }),
      );
    }

    const baseStatePatch = mergeRouterV2StatePatches(
      currentStateRecord,
      proposedPatch,
      catalogDecision.patch,
      retailStatePatch,
    );

    const exactProductResolution =
      analysis.slots.brand && analysis.slots.model
        ? await discoverExactProducts({
            brand: analysis.slots.brand,
            model: analysis.slots.model,
          })
        : null;

    const exactProductDecision =
      buildRouterV2ProductDecision(exactProductResolution);

    const genericSearchAllowedStage =
      !currentState?.stage ||
      currentState.stage === "AWAITING_PRODUCT_QUERY";
    const shouldTryGenericTextProduct =
      !exactProductResolution &&
      catalogDecision.action === "NONE" &&
      (
        analysis.nextAction === "RESOLVE_PRODUCT" ||
        (Boolean(productQuestion) && !currentState?.selectedProductCode) ||
        looksLikeProductCode(input.content) ||
        (genericSearchAllowedStage &&
          (analysis.intents.length === 0 ||
            analysis.intents.includes("PURCHASE_INTENT")))
      );

    const textProductResolution = shouldTryGenericTextProduct
      ? await resolveRouterV2TextProduct(input.content)
      : null;

    const genericProductDecision =
      textProductResolution &&
      textProductResolution.status !== "NO_QUERY"
        ? buildRouterV2ProductDecision(textProductResolution)
        : null;

    const isPaymentEvidenceStage =
      currentState?.stage === "AWAITING_PAYMENT_CONFIRMATION";
    const hasImageMessage =
      !isPaymentEvidenceStage &&
      (Boolean(input.mediaUrl) ||
        (input.messageType ?? "").toUpperCase() === "IMAGE");

    const visualResolution = hasImageMessage
      ? await resolveRouterV2VisualProduct(input.visualHints ?? null)
      : null;
    const visualDecision = buildRouterV2VisualDecision(
      visualResolution,
    );

    const productDecision =
      exactProductDecision ??
      genericProductDecision ??
      visualDecision;

    const priorShownProducts = readShownProducts(
      currentState?.shownProducts,
    );

    const canResolveProductReference =
      shouldResolveShownProductReference({
        stage: currentState?.stage,
        hasProductResolution: Boolean(
          exactProductResolution || genericProductDecision,
        ),
        shownProducts: priorShownProducts,
        quantity: analysis.slots.quantity,
        intents: analysis.intents,
      });

    const productReference = canResolveProductReference
      ? resolveShownProductReference(
          input.content,
          priorShownProducts,
        )
      : null;

    const incomingPaymentEvidence =
      isPaymentEvidenceStage &&
      (Boolean(input.mediaUrl) ||
        ["IMAGE", "DOCUMENT"].includes(
          (input.messageType ?? "").toUpperCase(),
        ));

    const analysisNextAction = incomingPaymentEvidence
      ? "CONTINUE_SALES_FLOW"
      : analysis.nextAction;

    const nextAction = determineRouterV2FinalAction({
      botEnabled: conversation.botEnabled,
      analysisNextAction,
      productDecision,
      productReference,
      canResolveProductReference,
    });

    let proposedStatePatch = buildRouterV2DecisionStatePatch({
      basePatch: baseStatePatch,
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
      proposedStatePatch.unitPrice = commercialPrice.unitPrice;
      proposedStatePatch.priceTier = commercialPrice.priceTier;
      proposedStatePatch.total = commercialPrice.total;

      if (!proposedStatePatch.category && commercialPrice.product.category) {
        proposedStatePatch.category = commercialPrice.product.category;
      }

      if (
        currentState?.stage === "AWAITING_QUANTITY" ||
        proposedStatePatch.stage === "AWAITING_QUANTITY"
      ) {
        proposedStatePatch.stage = "AWAITING_PRICE_CONFIRMATION";
      }
    }

    const selectedProductCodeForInfo =
      typeof proposedStatePatch.selectedProductCode === "string"
        ? proposedStatePatch.selectedProductCode
        : proposedStatePatch.selectedProductCode === null
          ? null
          : currentState?.selectedProductCode ?? null;

    const productInformation = selectedProductCodeForInfo
      ? await getRouterV2ProductInformation(
          selectedProductCodeForInfo,
        )
      : null;

    const productSpecification =
      productQuestion === "SPECIFICATION" && productInformation
        ? findRouterV2ProductSpecification(
            productInformation,
            input.content,
          )
        : null;

    const paymentMethodCandidate =
      resolveRouterV2PaymentSelection({
        content: input.content,
        stage: currentState?.stage,
      });

    const projectedBeforeCheckout = {
      ...(currentStateRecord ?? {}),
      ...proposedStatePatch,
    };

    const shouldRunCheckout = shouldAttemptCheckout({
      stage:
        typeof projectedBeforeCheckout.stage === "string"
          ? projectedBeforeCheckout.stage
          : null,
      analysisNextAction,
      content: input.content,
      deliveryMethodCandidate:
        analysis.slots.deliveryMethod ?? null,
      paymentMethodCandidate,
      messageType: input.messageType,
      mediaUrl: input.mediaUrl,
      hasProductQuestion: Boolean(productQuestion),
      catalogAction: catalogDecision.action,
    });

    const checkoutDecision = shouldRunCheckout
      ? resolveRouterV2CheckoutFlow({
          content: input.content,
          messageType: input.messageType,
          mediaUrl: input.mediaUrl,
          state: projectedBeforeCheckout,
          contact: conversation.contact,
          deliveryMethodCandidate:
            analysis.slots.deliveryMethod ?? null,
          paymentMethodCandidate,
          allowedDeliveryMethods:
            businessKnowledge.deliveryMethods,
          allowedPaymentMethods:
            businessKnowledge.paymentMethods,
        })
      : {
          patch: {},
          step: null,
          consumedInput: false,
          createPendingOrder: false,
          paymentMethodToPersist: null,
        };

    proposedStatePatch = mergeRouterV2StatePatches(
      currentStateRecord,
      proposedStatePatch,
      checkoutDecision.patch,
    );

    const shouldPersistState = shouldPersistRouterV2State({
      botEnabled: conversation.botEnabled,
      finalAction: nextAction,
      proposedStatePatch,
    });

    let persistedState = shouldPersistState
      ? await persistRouterV2State(
          conversation.id,
          proposedStatePatch,
        )
      : null;

    let orderCreation: Awaited<
      ReturnType<typeof createRouterV2PendingOrder>
    > | null = null;

    if (checkoutDecision.createPendingOrder && persistedState) {
      orderCreation = await createRouterV2PendingOrder({
        conversationId: conversation.id,
        state: persistedState,
        currencySymbol: businessKnowledge.currencySymbol,
      });

      if (
        orderCreation.status === "CREATED" ||
        orderCreation.status === "EXISTING"
      ) {
        persistedState = await persistRouterV2State(
          conversation.id,
          {
            orderNumber: orderCreation.order.orderNumber,
          },
        );
      } else {
        persistedState = await persistRouterV2State(
          conversation.id,
          {
            stage: "AWAITING_ORDER_CONFIRMATION",
          },
        );
      }
    }

    let paymentMethodUpdate: Awaited<
      ReturnType<typeof updateRouterV2OrderPaymentMethod>
    > | null = null;

    if (
      checkoutDecision.paymentMethodToPersist &&
      persistedState?.orderNumber
    ) {
      paymentMethodUpdate =
        await updateRouterV2OrderPaymentMethod({
          orderNumber: persistedState.orderNumber,
          paymentMethod:
            checkoutDecision.paymentMethodToPersist,
        });
    }

    const requestedOrderNumber =
      extractRouterV2OrderNumber(input.content) ??
      (analysis.intents.includes("ORDER_STATUS")
        ? persistedState?.orderNumber ??
          currentState?.orderNumber ??
          null
        : null);

    const orderStatus = requestedOrderNumber
      ? await getRouterV2OrderStatus(requestedOrderNumber)
      : null;

    const orderCreationFailed = Boolean(
      orderCreation &&
        orderCreation.status !== "CREATED" &&
        orderCreation.status !== "EXISTING",
    );

    const finalState = persistedState ?? currentState;
    const responsePlan = buildRouterV2ResponsePlan({
      finalAction: orderCreationFailed
        ? "HUMAN_HANDOFF"
        : nextAction,
      state: finalState,
      productQuestion,
      productInformationAvailable: Boolean(productInformation),
      visualResolutionStatus:
        visualResolution?.status ?? null,
      catalogDecision,
      checkoutStep: checkoutDecision.step,
      checkoutConsumed: checkoutDecision.consumedInput,
    });

    const responseContext = buildRouterV2ResponseContext({
      customerMessage: input.content,
      responsePlan,
      state: finalState,
      commercialPrice,
      productInformation,
      productSpecification,
      visualResolution,
      businessKnowledge,
      catalogDecision,
      retailProducts:
        retailDiscovery?.status === "READY"
          ? retailDiscovery.matches
          : [],
      checkoutStep: checkoutDecision.step,
      orderStatus,
    });

    const draftText = buildRouterV2ResponseDraft(
      responseContext,
    );
    const outboundMessages = buildRouterV2OutboundMessages({
      context: responseContext,
      draftText,
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
      mergedContext,
      catalogDecision,
      retailDiscovery,
      exactProductResolution,
      textProductResolution,
      productDecision,
      productReference,
      visualResolution,
      productQuestion,
      productInformation,
      productSpecification,
      commercialPrice,
      checkoutDecision,
      orderCreation,
      paymentMethodUpdate,
      orderStatus,
      nextAction,
      responsePlan,
      responseContext,
      draftText,
      outboundMessages,
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
