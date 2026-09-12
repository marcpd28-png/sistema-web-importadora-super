type CheckoutStateLike = {
  stage?: string | null;
  customerData?: unknown;
  documentData?: unknown;
  deliveryData?: unknown;
  paymentData?: unknown;
  orderNumber?: string | null;
};

type ContactLike = {
  name?: string | null;
  phone?: string | null;
};

export type RouterV2CheckoutStep =
  | "ASK_QUANTITY"
  | "ASK_PRICE_CONFIRMATION"
  | "ASK_CUSTOMER_DATA"
  | "ASK_DOCUMENT_TYPE"
  | "ASK_DOCUMENT_DATA"
  | "ASK_DELIVERY_METHOD"
  | "ASK_DELIVERY_DETAILS"
  | "DELIVERY_METHOD_UNAVAILABLE"
  | "DELIVERY_CONFIGURATION_MISSING"
  | "ASK_ORDER_CONFIRMATION"
  | "ASK_PAYMENT_METHOD"
  | "ASK_PAYMENT_EVIDENCE"
  | "PAYMENT_EVIDENCE_RECEIVED"
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "PAYMENT_CONFIGURATION_MISSING"
  | null;

export type RouterV2CheckoutDecision = {
  patch: Record<string, unknown>;
  step: RouterV2CheckoutStep;
  consumedInput: boolean;
  createPendingOrder: boolean;
  paymentMethodToPersist: string | null;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function affirmative(text: string) {
  return /^(si|sí|s|ok|okay|dale|listo|correcto|confirmo|confirmado|continua|continuar|procede|proceder|de acuerdo|esta bien|está bien|ya)[.!]?$/i.test(
    text.trim(),
  );
}

function usableContactName(value: string | null | undefined) {
  const name = value?.trim() ?? "";
  if (!name) return "";
  if (/^(sin nombre|cliente|whatsapp|unknown|desconocido)$/i.test(name)) return "";
  if (/^\+?\d{7,15}$/.test(name.replace(/\s+/g, ""))) return "";
  return name;
}

function detectDocumentType(text: string) {
  const value = normalize(text);
  if (/\bfactura\b/.test(value)) return "FACTURA";
  if (/\bboleta\b/.test(value)) return "BOLETA";
  return null;
}

function detectDocumentNumber(text: string, type: string | null) {
  const digits = text.replace(/\D/g, "");

  if (type === "FACTURA") {
    const match = digits.match(/\d{11}/);
    return match?.[0] ?? null;
  }

  if (type === "BOLETA") {
    const match = digits.match(/\d{8}/);
    return match?.[0] ?? null;
  }

  return null;
}

function detectPaymentMethod(content: string) {
  const text = normalize(content);
  if (/\byape\b/.test(text)) return "YAPE";
  if (/\bplin\b/.test(text)) return "PLIN";
  if (/\b(interbank|transferencia|transferir|deposito)\b/.test(text)) {
    return "TRANSFERENCIA";
  }
  if (/\b(tarjeta|culqi|visa|mastercard)\b/.test(text)) return "TARJETA";
  if (/\befectivo\b/.test(text)) return "EFECTIVO";
  return null;
}

function paymentAllowed(method: string, allowed: string[]) {
  if (allowed.length === 0) return false;
  const normalizedAllowed = allowed.map(normalizeToken);
  const methodNormalized = normalizeToken(method);

  return normalizedAllowed.some((allowedMethod) => {
    if (methodNormalized === "TRANSFERENCIA") {
      return (
        allowedMethod.includes("TRANSFER") ||
        allowedMethod.includes("INTERBANK") ||
        allowedMethod.includes("DEPOSITO")
      );
    }

    if (methodNormalized === "TARJETA") {
      return (
        allowedMethod.includes("TARJETA") ||
        allowedMethod.includes("CULQI") ||
        allowedMethod.includes("VISA") ||
        allowedMethod.includes("MASTERCARD")
      );
    }

    return allowedMethod.includes(methodNormalized);
  });
}

function deliveryAllowed(method: string, allowed: string[]) {
  if (allowed.length === 0) return false;
  const wanted = normalizeToken(method);

  return allowed.some((item) => {
    const configured = normalizeToken(item);
    if (wanted === "RECOJO") {
      return configured.includes("RECOJO") || configured.includes("PICKUP");
    }
    if (wanted === "DELIVERY") {
      return configured.includes("DELIVERY") || configured.includes("DOMICILIO");
    }
    return configured.includes(wanted);
  });
}

export function resolveRouterV2CheckoutFlow(input: {
  content: string;
  messageType?: string | null;
  mediaUrl?: string | null;
  state: CheckoutStateLike | null;
  contact?: ContactLike | null;
  deliveryMethodCandidate?: string | null;
  allowedDeliveryMethods?: string[];
  allowedPaymentMethods?: string[];
}): RouterV2CheckoutDecision {
  const state = input.state;
  const patch: Record<string, unknown> = {};
  const result = (
    step: RouterV2CheckoutStep = null,
    consumedInput = false,
  ): RouterV2CheckoutDecision => ({
    patch,
    step,
    consumedInput,
    createPendingOrder: false,
    paymentMethodToPersist: null,
  });

  if (!state?.stage) return result();

  const text = input.content.trim();
  const customerData = asRecord(state.customerData);
  const documentData = asRecord(state.documentData);
  const deliveryData = asRecord(state.deliveryData);
  const paymentData = asRecord(state.paymentData);

  if (state.stage === "AWAITING_PURCHASE_CONFIRMATION") {
    if (!affirmative(text)) return result();

    patch.purchaseIntent = true;
    patch.stage = "AWAITING_QUANTITY";
    return result("ASK_QUANTITY", true);
  }

  if (state.stage === "AWAITING_PRICE_CONFIRMATION") {
    if (!affirmative(text)) return result("ASK_PRICE_CONFIRMATION");

    const contactName = usableContactName(input.contact?.name);
    const contactPhone = input.contact?.phone?.trim() ?? "";

    if (contactName || contactPhone) {
      patch.customerData = {
        ...customerData,
        ...(contactName ? { name: contactName } : {}),
        ...(contactPhone ? { phone: contactPhone } : {}),
      };
    }

    if (contactName && contactPhone) {
      patch.stage = "AWAITING_DOCUMENT_TYPE";
      return result("ASK_DOCUMENT_TYPE", true);
    }

    patch.stage = "AWAITING_CUSTOMER_DATA";
    return result("ASK_CUSTOMER_DATA", true);
  }

  if (state.stage === "AWAITING_CUSTOMER_DATA") {
    const currentName = readString(customerData, "name");
    const currentPhone =
      readString(customerData, "phone") ?? input.contact?.phone?.trim() ?? null;

    if (!currentName && text.length >= 3 && !affirmative(text)) {
      patch.customerData = {
        ...customerData,
        name: text.slice(0, 180),
        ...(currentPhone ? { phone: currentPhone } : {}),
      };
      patch.stage = "AWAITING_DOCUMENT_TYPE";
      return result("ASK_DOCUMENT_TYPE", true);
    }

    if (currentName && currentPhone) {
      patch.stage = "AWAITING_DOCUMENT_TYPE";
      return result("ASK_DOCUMENT_TYPE", true);
    }

    return result("ASK_CUSTOMER_DATA");
  }

  if (state.stage === "AWAITING_DOCUMENT_TYPE") {
    const type = detectDocumentType(text);
    if (!type) return result("ASK_DOCUMENT_TYPE");

    patch.documentData = {
      ...documentData,
      type,
    };
    patch.stage = "AWAITING_DOCUMENT_DATA";
    return result("ASK_DOCUMENT_DATA", true);
  }

  if (state.stage === "AWAITING_DOCUMENT_DATA") {
    const type = readString(documentData, "type");
    const normalizedText = normalize(text);

    if (
      type === "BOLETA" &&
      /\b(sin dni|no deseo dar dni|sin documento)\b/.test(normalizedText)
    ) {
      patch.documentData = {
        ...documentData,
        number: null,
      };
      patch.stage = "AWAITING_DELIVERY_METHOD";
      return result("ASK_DELIVERY_METHOD", true);
    }

    const number = detectDocumentNumber(text, type);
    if (!number) return result("ASK_DOCUMENT_DATA");

    patch.documentData = {
      ...documentData,
      number,
    };
    patch.stage = "AWAITING_DELIVERY_METHOD";
    return result("ASK_DELIVERY_METHOD", true);
  }

  if (state.stage === "AWAITING_DELIVERY_METHOD") {
    const method = input.deliveryMethodCandidate?.trim() ?? "";
    if (!method) return result("ASK_DELIVERY_METHOD");

    const allowed = input.allowedDeliveryMethods ?? [];
    if (allowed.length === 0) {
      return result("DELIVERY_CONFIGURATION_MISSING", true);
    }
    if (!deliveryAllowed(method, allowed)) {
      return result("DELIVERY_METHOD_UNAVAILABLE", true);
    }

    patch.deliveryData = {
      ...deliveryData,
      method,
    };

    if (method === "RECOJO") {
      patch.stage = "AWAITING_ORDER_CONFIRMATION";
      return result("ASK_ORDER_CONFIRMATION", true);
    }

    patch.stage = "AWAITING_DELIVERY_DETAILS";
    return result("ASK_DELIVERY_DETAILS", true);
  }

  if (state.stage === "AWAITING_DELIVERY_DETAILS") {
    if (text.length < 3) return result("ASK_DELIVERY_DETAILS");

    patch.deliveryData = {
      ...deliveryData,
      details: text.slice(0, 500),
    };
    patch.stage = "AWAITING_ORDER_CONFIRMATION";
    return result("ASK_ORDER_CONFIRMATION", true);
  }

  if (state.stage === "AWAITING_ORDER_CONFIRMATION") {
    if (!affirmative(text)) return result("ASK_ORDER_CONFIRMATION");

    patch.stage = "AWAITING_PAYMENT_METHOD";
    return {
      patch,
      step: "ASK_PAYMENT_METHOD",
      consumedInput: true,
      createPendingOrder: !state.orderNumber,
      paymentMethodToPersist: null,
    };
  }

  if (state.stage === "AWAITING_PAYMENT_METHOD") {
    const method = detectPaymentMethod(text);
    if (!method) return result("ASK_PAYMENT_METHOD");

    const allowed = input.allowedPaymentMethods ?? [];
    if (allowed.length === 0) {
      return result("PAYMENT_CONFIGURATION_MISSING", true);
    }

    if (!paymentAllowed(method, allowed)) {
      return result("PAYMENT_METHOD_UNAVAILABLE", true);
    }

    patch.paymentData = {
      ...paymentData,
      method,
      evidenceReceived: false,
      verified: false,
    };
    patch.stage = "AWAITING_PAYMENT_CONFIRMATION";

    return {
      patch,
      step: "ASK_PAYMENT_EVIDENCE",
      consumedInput: true,
      createPendingOrder: false,
      paymentMethodToPersist: method,
    };
  }

  if (state.stage === "AWAITING_PAYMENT_CONFIRMATION") {
    const hasEvidence =
      Boolean(input.mediaUrl) ||
      ["IMAGE", "DOCUMENT"].includes(
        (input.messageType ?? "").toUpperCase(),
      );

    if (!hasEvidence) return result("ASK_PAYMENT_EVIDENCE");

    patch.paymentData = {
      ...paymentData,
      evidenceReceived: true,
      verified: false,
      ...(input.mediaUrl ? { evidenceUrl: input.mediaUrl } : {}),
    };

    return result("PAYMENT_EVIDENCE_RECEIVED", true);
  }

  return result();
}
