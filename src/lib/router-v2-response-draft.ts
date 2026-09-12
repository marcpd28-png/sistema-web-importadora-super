import type { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";

type ResponseContext = ReturnType<typeof buildRouterV2ResponseContext>;

function money(value: number | null, currency = "S/") {
  if (value === null || !Number.isFinite(value)) return null;
  return `${currency}${value.toFixed(2)}`;
}

function resumePrompt(context: ResponseContext) {
  const action = context.resumeAction;

  if (action === "ASK_PURCHASE_MODE") {
    return "¿Tu compra será por mayor o por unidades?";
  }
  if (action === "ASK_PRODUCT") {
    return "¿Qué producto o categoría estás buscando?";
  }
  if (action === "ASK_VARIANT") {
    return "¿Cuál de estas opciones prefieres? Puedes indicarme el color, código o número de opción.";
  }
  if (action === "ASK_QUANTITY") {
    return "¿Cuántas unidades deseas?";
  }
  if (action === "ASK_PURCHASE_CONFIRMATION") {
    return "¿Deseas comprar este producto?";
  }
  if (action === "ASK_PRICE_CONFIRMATION") {
    return "¿Confirmas este pedido para continuar con tus datos?";
  }
  if (action === "ASK_CUSTOMER_DATA") {
    return "Indícame tu nombre completo para continuar con el pedido.";
  }
  if (action === "ASK_DOCUMENT_TYPE") {
    return "¿Necesitas boleta o factura?";
  }
  if (action === "ASK_DOCUMENT_DATA") {
    return context.sales.documentType === "FACTURA"
      ? "Envíame el RUC de 11 dígitos para la factura."
      : "Envíame tu DNI de 8 dígitos. Si prefieres boleta sin DNI, indícame “sin DNI”.";
  }
  if (action === "ASK_DELIVERY_METHOD") {
    return "¿Prefieres recojo o envío? Si será por agencia, indícame cuál.";
  }
  if (action === "ASK_DELIVERY_DETAILS") {
    return "Indícame la ciudad, agencia o dirección necesaria para coordinar la entrega.";
  }
  if (action === "ASK_ORDER_CONFIRMATION") {
    return "¿Confirmas que los datos del pedido están correctos?";
  }
  if (action === "ASK_PAYMENT_METHOD") {
    return "¿Qué método de pago prefieres?";
  }
  if (action === "ASK_PAYMENT_EVIDENCE") {
    return "Cuando realices el pago, envíame el voucher para registrarlo y validarlo.";
  }

  return null;
}

function appendResume(answer: string, context: ResponseContext) {
  const prompt = resumePrompt(context);
  if (!prompt) return answer.trim();
  return `${answer.trim()}\n\n${prompt}`;
}

function requestedDeliveryMethod(message: string) {
  const text = message.toLowerCase();
  if (/\bshalom\b/.test(text)) return "SHALOM";
  if (/\bolva\b/.test(text)) return "OLVA";
  if (/\b(recojo|recoger|pickup)\b/.test(text)) return "RECOJO";
  if (/\b(delivery|domicilio|reparto)\b/.test(text)) return "DELIVERY";
  return null;
}

function configuredDeliveryMatches(configured: string, requested: string) {
  const value = configured.toUpperCase();
  if (requested === "RECOJO") {
    return value.includes("RECOJO") || value.includes("PICKUP");
  }
  if (requested === "DELIVERY") {
    return value.includes("DELIVERY") || value.includes("DOMICILIO");
  }
  return value.includes(requested);
}

function formatProductDetails(context: ResponseContext) {
  const product = context.product;
  const name = context.sales.productName ?? "el producto";
  if (!product) {
    return `Tengo seleccionado ${name}, pero no encuentro una ficha técnica registrada para mostrarte.`;
  }

  const description =
    product.descriptionShort ??
    product.description ??
    product.descriptionFull ??
    null;
  const specs = product.specifications.slice(0, 6);
  const lines = [`${name}.`];

  if (description) lines.push(description);
  if (specs.length > 0) {
    lines.push(
      specs
        .map((item) => `• ${item.name}: ${item.value}`)
        .join("\n"),
    );
  } else if (product.technicalSpecs) {
    lines.push(product.technicalSpecs);
  }

  const price = money(
    context.sales.unitPrice,
    context.business?.currencySymbol || "S/",
  );
  if (price) lines.push(`Precio vigente por unidad: ${price}.`);
  lines.push(
    product.available
      ? "Actualmente figura disponible."
      : "Actualmente no figura disponible.",
  );

  return lines.join("\n");
}

export function buildRouterV2ResponseDraft(context: ResponseContext) {
  const currency = context.business?.currencySymbol || "S/";
  const answerType = context.answerType;

  if (answerType === "HUMAN_HANDOFF") {
    return "Voy a derivar esta conversación a un asesor para que pueda ayudarte correctamente.";
  }

  if (answerType === "CATALOG_PURCHASE_MODE") {
    return "Claro. Para enviarte la opción más útil, ¿tu compra será por mayor o por unidades?";
  }

  if (answerType === "WHOLESALE_CATALOG") {
    if (context.catalog.wholesaleCatalogUrl) {
      return "Perfecto, para compra mayorista te comparto el catálogo. Luego indícame el producto y la cantidad y te calculo el precio vigente para continuar el pedido.";
    }

    return "Puedo atender tu compra mayorista, pero el catálogo mayorista todavía no está configurado en el sistema. Indícame qué producto o categoría buscas y te ayudo con precios y cantidades reales.";
  }

  if (answerType === "RETAIL_DISCOVERY") {
    if (context.catalog.retailProducts.length > 0) {
      return "Para compra por unidades te muestro productos concretos con su imagen y precio vigente. Elige uno y te doy su información completa, especificaciones y opciones para continuar la compra.";
    }

    return "Para compra por unidades puedo mostrarte la imagen, precio y detalles de cada producto. ¿Qué producto o categoría estás buscando?";
  }

  if (answerType === "CATALOG") {
    return appendResume(
      "Puedo ayudarte con el catálogo y también guiarte directamente hasta completar la compra.",
      context,
    );
  }

  if (answerType === "IMAGE_PRODUCT_CLARIFICATION") {
    return "Recibí la imagen, pero todavía no puedo asegurar qué producto exacto es. Envíame una foto donde se vea la marca, modelo, código o etiqueta de la caja para identificarlo sin adivinar.";
  }

  if (answerType === "PRODUCT_CLARIFICATION") {
    return "No pude identificar un producto exacto con esos datos. Indícame la marca y modelo, o envíame una foto o código para ubicarlo correctamente.";
  }

  if (
    answerType === "VARIANT_OPTIONS" ||
    answerType === "VARIANT_CLARIFICATION"
  ) {
    const options = context.sales.shownProducts;
    const answer = options.length
      ? `Encontré estas opciones:\n${options
          .map((item) => {
            const price = money(item.unitPrice, currency);
            return `${item.position ?? "-"}. ${item.name}${price ? ` — ${price}` : ""}`;
          })
          .join("\n")}`
      : "Encontré más de una opción para ese producto.";

    return appendResume(answer, context);
  }

  if (answerType === "PRODUCT_CONFIRMED") {
    const name =
      context.sales.productName ??
      context.sales.productCode ??
      "el producto";
    return appendResume(
      `Perfecto, tengo identificado ${name}.`,
      context,
    );
  }

  if (answerType === "PRODUCT_DETAILS") {
    return appendResume(formatProductDetails(context), context);
  }

  if (answerType === "PRODUCT_SPECIFICATION") {
    const matched = context.product?.matchedSpecification;
    const name = context.sales.productName ?? "este producto";

    const answer = matched
      ? `${name}: ${matched.name}: ${matched.value}.`
      : `No encuentro ese dato específico registrado en la ficha de ${name}. Prefiero no inventarlo.`;

    return appendResume(answer, context);
  }

  if (answerType === "PRODUCT_PRICE") {
    const price = money(context.sales.unitPrice, currency);
    const name = context.sales.productName ?? "este producto";
    const wholesale = context.product?.wholesalePrice ?? null;
    const wholesaleText =
      wholesale !== null && context.product
        ? ` Precio mayorista desde ${context.product.wholesaleMinQty} unidades: ${money(wholesale, currency)} c/u.`
        : "";

    const answer = price
      ? `${name} está a ${price} por unidad.${wholesaleText}`
      : `No tengo un precio vigente confirmado para ${name}.`;

    return appendResume(answer, context);
  }

  if (answerType === "PRODUCT_STOCK") {
    const name = context.sales.productName ?? "este producto";
    const answer =
      context.product?.available === true
        ? `Sí, ${name} aparece disponible actualmente.`
        : `En este momento ${name} no aparece disponible.`;
    return appendResume(answer, context);
  }

  if (answerType === "PRODUCT_WHOLESALE") {
    const product = context.product;
    const name = context.sales.productName ?? "este producto";
    const answer =
      product?.wholesalePrice !== null &&
      product?.wholesalePrice !== undefined
        ? `${name} tiene precio mayorista desde ${product.wholesaleMinQty} unidades: ${money(product.wholesalePrice, currency)} c/u.`
        : `${name} no tiene un precio mayorista distinto registrado actualmente.`;
    return appendResume(answer, context);
  }

  if (
    answerType === "PRICE_SUMMARY" ||
    answerType === "CHECKOUT_PRICE_CONFIRMATION"
  ) {
    const quantity = context.sales.quantity;
    const unit = money(context.sales.unitPrice, currency);
    const total = money(context.sales.total, currency);
    const name =
      context.sales.productName ??
      context.sales.productCode ??
      "el producto";
    const tier =
      context.sales.priceTier === "MAYORISTA"
        ? "precio mayorista"
        : "precio unitario";

    const answer =
      quantity && unit && total
        ? `${quantity} unidad${quantity === 1 ? "" : "es"} de ${name}: ${unit} c/u (${tier}). Total: ${total}.`
        : `Tengo seleccionado ${name}, pero falta completar cantidad o precio antes de confirmar.`;

    return appendResume(answer, context);
  }

  if (answerType === "LOGISTICS") {
    const requested = requestedDeliveryMethod(
      context.customerMessage,
    );
    const configured = context.business?.deliveryMethods ?? [];
    let answer: string;

    if (requested) {
      const available = configured.some((item) =>
        configuredDeliveryMatches(item, requested),
      );
      if (configured.length === 0) {
        answer = `No tengo configurada una lista oficial de métodos de entrega para confirmar ${requested} sin riesgo de darte información incorrecta.`;
      } else if (available) {
        answer = `Sí, ${requested} figura entre los métodos de entrega configurados.`;
      } else {
        answer = `${requested} no figura entre los métodos de entrega configurados actualmente. Tenemos: ${configured.join(", ")}.`;
      }
    } else if (configured.length > 0) {
      answer = `Los métodos de entrega configurados son: ${configured.join(", ")}.`;
    } else {
      answer = "Todavía no tengo configurada la política de entregas para confirmarte una opción específica sin inventar información.";
    }

    return appendResume(answer, context);
  }

  if (answerType === "PAYMENT") {
    const methods = context.business?.paymentMethods ?? [];
    const answer = methods.length
      ? `Los métodos de pago configurados son: ${methods.join(", ")}.`
      : "Todavía no tengo los métodos de pago oficiales configurados en el bot, así que no voy a inventarlos.";
    return appendResume(answer, context);
  }

  if (answerType === "DOCUMENT") {
    return appendResume(
      "Podemos registrar el pedido con boleta o factura. Para factura necesitaremos el RUC.",
      context,
    );
  }

  if (answerType === "ORDER_STATUS") {
    if (!context.order) {
      return "No encontré una orden asociada para consultar. Envíame el número de pedido para revisarlo.";
    }

    const labels: Record<string, string> = {
      PENDING: "pendiente de pago o validación",
      PAID: "pagado",
      FAILED: "con pago fallido",
      CANCELED: "cancelado",
      SHIPPED: "enviado",
      DELIVERED: "entregado",
    };
    return `El pedido ${context.order.orderNumber} está ${labels[context.order.status] ?? context.order.status.toLowerCase()}.`;
  }

  if (answerType === "CHECKOUT_CUSTOMER_DATA") {
    return "Continuemos con el pedido. Indícame tu nombre completo.";
  }

  if (answerType === "CHECKOUT_DOCUMENT_TYPE") {
    return "Perfecto. ¿Necesitas boleta o factura?";
  }

  if (answerType === "CHECKOUT_DOCUMENT_DATA") {
    return context.sales.documentType === "FACTURA"
      ? "Envíame el RUC de 11 dígitos para registrar la factura."
      : "Envíame tu DNI de 8 dígitos. Si prefieres boleta sin DNI, indícame “sin DNI”.";
  }

  if (answerType === "CHECKOUT_DELIVERY_METHOD") {
    const methods = context.business?.deliveryMethods ?? [];
    return methods.length
      ? `¿Cómo deseas recibir tu pedido? Opciones configuradas: ${methods.join(", ")}.`
      : "Todavía no tengo configurados métodos oficiales de entrega en el bot. Prefiero no registrar una modalidad hasta que esa configuración esté definida.";
  }

  if (answerType === "DELIVERY_CONFIGURATION_MISSING") {
    return "No puedo registrar ese método de entrega porque la configuración oficial de entregas está vacía. Prefiero detener este paso antes que prometer una modalidad no confirmada.";
  }

  if (answerType === "DELIVERY_METHOD_UNAVAILABLE") {
    const methods = context.business?.deliveryMethods ?? [];
    return methods.length
      ? `Ese método de entrega no está habilitado actualmente. Las opciones configuradas son: ${methods.join(", ")}.`
      : "Ese método de entrega no está disponible y todavía no tengo alternativas oficiales configuradas para ofrecerte.";
  }

  if (answerType === "CHECKOUT_DELIVERY_DETAILS") {
    return "Indícame la ciudad, agencia o dirección necesaria para coordinar la entrega.";
  }

  if (answerType === "CHECKOUT_ORDER_CONFIRMATION") {
    const total = money(context.sales.total, currency);
    const number = context.sales.orderNumber
      ? ` Pedido ${context.sales.orderNumber}.`
      : "";
    return `Ya tengo los datos principales del pedido.${number}${total ? ` Total: ${total}.` : ""} ¿Confirmas que todo está correcto?`;
  }

  if (answerType === "CHECKOUT_PAYMENT_METHOD") {
    const methods = context.business?.paymentMethods ?? [];
    if (!methods.length) {
      return "El pedido quedó preparado, pero todavía no están configurados los métodos de pago oficiales en el bot. Un asesor deberá confirmarlos antes de continuar.";
    }
    return `Pedido ${context.sales.orderNumber ?? "registrado"}. ¿Qué método de pago prefieres? Tenemos: ${methods.join(", ")}.`;
  }

  if (answerType === "PAYMENT_CONFIGURATION_MISSING") {
    return "No puedo indicarte un método de pago todavía porque la configuración oficial de pagos está vacía. Prefiero detener el cobro antes que darte datos incorrectos.";
  }

  if (answerType === "PAYMENT_METHOD_UNAVAILABLE") {
    const methods = context.business?.paymentMethods ?? [];
    return methods.length
      ? `Ese método no está habilitado en la configuración actual. Puedes usar: ${methods.join(", ")}.`
      : "Ese método no está disponible y no tengo otros métodos oficiales configurados para ofrecerte.";
  }

  if (answerType === "CHECKOUT_PAYMENT_EVIDENCE") {
    return "Método de pago registrado. Cuando realices el pago, envíame el voucher. El bot lo registrará como evidencia, pero no marcará el pedido como pagado hasta que sea validado.";
  }

  if (answerType === "PAYMENT_EVIDENCE_RECEIVED") {
    return `Recibí el voucher${context.sales.orderNumber ? ` del pedido ${context.sales.orderNumber}` : ""}. Queda pendiente de validación; todavía no lo marcaré como pago confirmado.`;
  }

  return appendResume("Continuemos con tu compra.", context);
}
