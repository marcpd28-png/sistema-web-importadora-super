import { matchesRequestedModel } from "./model-match";
import { randomUUID } from "node:crypto";
import { memorySchema, planSchema, type LLMProvider, type ProductFact, type RockyMemory, type RockyResult } from "./contracts";
import { detectPlan, SYSTEM_PROMPT } from "./planning";
import { selectSkill } from "./skills";
import { ToolExecutor, type ToolBackend, type ToolName } from "./tools";
import { compareFacts } from "./sales";
import { checkoutPrompt } from "./checkout";

export class RockyAIOrchestrator {
  constructor(private backend: ToolBackend, private provider?: LLMProvider) {}
  async chat(input: { text: string; memory?: RockyMemory; history?: string[]; image?: string; resolvedProductCode?: string; resolvedProductCodes?: string[] }): Promise<RockyResult> {
    const started = Date.now();
    const memory = input.memory || memorySchema.parse({});
    let plan = detectPlan(input.text, memory);
    if (input.resolvedProductCode && !plan.codes.length && ["UNKNOWN", "PRODUCT_SEARCH", "PRODUCT_DETAILS", "FOLLOW_UP", "PRICE_QUERY", "STOCK_QUERY", "WHOLESALE_QUERY"].includes(plan.intent)) {
      plan.codes = [input.resolvedProductCode];
      if (["UNKNOWN", "FOLLOW_UP", "PRODUCT_SEARCH"].includes(plan.intent)) plan.intent = "PRODUCT_DETAILS";
    }
    if (input.resolvedProductCodes?.length && !["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "ORDER_STATUS"].includes(plan.intent)) {
      plan.codes = input.resolvedProductCodes.slice(0, 6);
      plan.intent = "PRODUCT_DETAILS";
    }
    let tokens: RockyResult["tokens"] = null;
    let model = "rules-and-tools";
    let reasonCode: string | null = null;
    // High risk requests are decided before consulting the model.
    const exactToolRequest = plan.codes.length > 0 && ["STOCK_QUERY", "PRICE_QUERY", "PRODUCT_COMPARISON", "WHOLESALE_QUERY", "PRODUCT_DETAILS"].includes(plan.intent);
    if (this.provider && !exactToolRequest && (plan.intent === "UNKNOWN" || Boolean(input.image)) && !["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "ORDER_STATUS", "BUSINESS_QUERY"].includes(plan.intent)) {
      try {
        // Optional retrieval must not prevent deterministic handling or model fallback.
        const reviewedExamples = await this.backend.reviewedExamples?.(input.text).catch(() => []) || [];
        const generated = await this.provider.plan([
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ memory: { productCodes: memory.productCodes, query: memory.query, quantity: memory.quantity, needs: memory.needs }, history: memory.cart ? [] : input.history?.slice(-4).map(s => s.slice(0, 700)), reviewedExamples, message: input.text }), ...(input.image ? { images: [input.image] } : {}) },
        ]);
        tokens = generated.tokens; model = this.provider.model;
        // An uncertain model cannot override safety or explicit deterministic product/budget extraction.
        const proposed = planSchema.parse(generated.plan);
        // A planner cannot erase an explicit model/version, even when its JSON is valid.
        const anchors = plan.query.match(/\b[A-Za-z]*\d+[A-Za-z0-9-]*\b/g) || [];
        if (anchors.some(anchor => !proposed.query.toLowerCase().includes(anchor.toLowerCase()))) proposed.query = plan.query;
        plan = { ...plan, ...(plan.intent === "UNKNOWN" ? { intent: proposed.intent, query: proposed.query } : {}),
          ...((["PRODUCT_SEARCH", "PRODUCT_RECOMMENDATION", "CATALOG_REQUEST"].includes(plan.intent) || input.image && ["PRICE_QUERY", "STOCK_QUERY", "PRODUCT_DETAILS", "WHOLESALE_QUERY"].includes(plan.intent)) && proposed.query.trim() ? { query: proposed.query.replace(/\b\d+(?:\.\d+)?\s*(?:soles|PEN)\b/gi, "").trim() } : {}),
          codes: plan.codes.length ? plan.codes : proposed.codes.filter(code => new RegExp(`(?:^|[^A-Z0-9-])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Z0-9-])`, "i").test(input.text)) };
      } catch { reasonCode = "MODEL_UNAVAILABLE_OR_INVALID"; model = "deterministic-safe-fallback"; }
    }
    const skill = selectSkill(plan.intent);
    const executor = new ToolExecutor(this.backend, skill.tools);
    let catalog: RockyResult["catalog"];
    const products: ProductFact[] = []; const sources: RockyResult["sources"] = [];
    let requiresHuman = ["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "ORDER_STATUS"].includes(plan.intent);
    const call = async (name: ToolName, args: unknown) => {
      const result = await executor.execute(name, args);
      for (const product of result.products) if ((plan.codes.includes(product.code) || (plan.codes.length > 1 ? plan.codes.some(code => matchesRequestedModel(code, product)) : matchesRequestedModel(plan.query, product))) && !products.some(p => p.id === product.id) && (!(["PRODUCT_SEARCH", "PRODUCT_RECOMMENDATION"].includes(plan.intent) && plan.budget !== null) || product.unitPrice <= plan.budget!)) products.push(product);
      sources.push(...result.sources);
      if (result.catalog) catalog = result.catalog;
    };
    try {
      if (plan.intent === "CATALOG_REQUEST") {
        await call("getCatalog", { query: input.text });
      } else if (plan.intent === "BUSINESS_QUERY") {
        await call("getBusinessInfo", { query: input.text.slice(0, 120) });
        if (!sources.length) { requiresHuman = true; reasonCode = "BUSINESS_INFO_NOT_CONFIGURED"; }
      } else if (skill.tools.includes("handoffToHuman")) await call("handoffToHuman", { reasonCode: plan.intent });
      else if (["WARRANTY_QUERY", "DELIVERY_QUERY", "PAYMENT_QUERY", "RETURN_QUERY"].includes(plan.intent)) {
        const sourceType = { WARRANTY_QUERY: "WARRANTY", DELIVERY_QUERY: "DELIVERY", PAYMENT_QUERY: "PAYMENT", RETURN_QUERY: "RETURN" }[plan.intent as "WARRANTY_QUERY"];
        await call("searchKnowledge", { query: input.text.slice(0, 120), sourceType });
        if (!sources.length) { requiresHuman = true; reasonCode = "NO_APPROVED_KNOWLEDGE"; }
      } else if (plan.intent === "PRODUCT_COMPARISON" && plan.codes.length >= 2) {
        await call("compareProducts", { codes: plan.codes });
      } else if (plan.codes.length && !["GREETING", "UNKNOWN", "ORDER_STATUS", "FOLLOW_UP"].includes(plan.intent)) {
        const name = skill.tools.includes("getProductByCode") ? "getProductByCode" : skill.tools.includes("checkCompatibility") ? "checkCompatibility" : null;
        if (name) for (const code of plan.codes) await call(name, { code });
        else if (skill.tools.includes("searchProducts")) await call("searchProducts", { query: plan.codes[0], budget: plan.budget });
        if (["STOCK_QUERY", "WHOLESALE_QUERY"].includes(plan.intent) && skill.tools.includes("getStock")) for (const code of plan.codes) await call("getStock", { code });
        if (["PRICE_QUERY", "WHOLESALE_QUERY"].includes(plan.intent) && skill.tools.includes("getPrice")) for (const code of plan.codes) await call("getPrice", { code });
        if (["PRICE_OBJECTION", "WHOLESALE_QUERY", "PROMOTION_QUERY"].includes(plan.intent)) await call("getPromotions", { code: plan.codes[0] });
        if (plan.intent === "PRICE_OBJECTION") await call("searchProducts", { query: memory.query || plan.query, budget: plan.budget });
      } else if (plan.query && skill.tools.includes("searchProducts") && !["GREETING", "UNKNOWN", "FOLLOW_UP"].includes(plan.intent)) {
        await call("searchProducts", { query: plan.query, budget: plan.budget });
        if (!products.length && skill.tools.includes("searchKnowledge")) {
          await call("searchKnowledge", { query: plan.query });
          // RAG may identify a product, but its price and stock are always reloaded from the backend.
          for (const source of sources.filter(s => s.productId).slice(0, 3)) {
            await call("getProduct", { code: source.productId! });
          }
        }
      }
    } catch { requiresHuman = true; reasonCode = "TOOL_FAILED"; }
    if (plan.intent === "PRODUCT_COMPATIBILITY") { requiresHuman = true; reasonCode = "COMPATIBILITY_REQUIRES_VERIFICATION"; }
    if (plan.intent === "ORDER_STATUS") reasonCode = "IDENTITY_VERIFICATION_REQUIRED";
    if (["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY"].includes(plan.intent)) reasonCode = plan.intent;
    const exact = plan.codes.length > 0 && plan.codes.every(code => products.some(p => p.code.toUpperCase() === code.toUpperCase()));
    const evidence = ["RULE_BASED_INTENT", ...(exact ? ["EXACT_PRODUCT_MATCH"] : []), ...(products.length ? ["CURRENT_BACKEND_DATA"] : []), ...(sources.length ? ["APPROVED_KNOWLEDGE"] : []), ...(executor.calls.some(c => !c.ok) ? ["TOOL_FAILURE"] : [])];
    const confidence = requiresHuman ? 0.3 : plan.intent === "GREETING" ? 0.95 : exact ? 0.95 : products.length ? 0.75 : sources.length ? 0.7 : 0.35;
    // Deliberately render commercial assertions from evidence, never from unconstrained LLM prose.
    let reply = "Con gusto te ayudo 😊 ¿Qué producto buscas y para qué lo vas a utilizar? Puedes indicarme el código o tu presupuesto.";
    if (plan.intent === "GREETING") reply = "¡Hola! Soy Rocky, de Importadora Super 😊 ¿Qué producto buscas?";
    else if (requiresHuman) reply = plan.intent === "HUMAN_REQUEST" ? "Claro 😊 Te paso con un asesor para que pueda ayudarte." : "Quiero darte información correcta 😊 Necesito que un asesor verifique esta consulta. Dejo registrada tu solicitud para que te ayude.";
    else if (plan.intent === "SALES_OBJECTION") reply = "Claro, tómate tu tiempo. ¿Qué duda te falta resolver para decidir?";
    else if (plan.intent === "FOLLOW_UP") reply = memory.awaitingQuantity
      ? memory.pendingPurchaseQuantity ? "¿Qué producto eliges? Dime el código o una de las opciones." : "¿Cuántas unidades llevas?"
      : memory.cart ? `Conservamos tu compra. ${checkoutPrompt(memory.cart)}`
      : memory.productCodes.length === 1 ? "Con gusto 😊 Si deseas comprarlo, dime cuántas unidades necesitas." : "Con gusto 😊 ¿Qué producto te interesa?";
    else if (catalog) reply = catalog.scope === "FULL"
      ? `¡Claro! 😊 Puedes encontrar nuestro catálogo completo en la página web oficial 🛍️\n${catalog.url}\n\nSi me dices qué producto o marca buscas, te ayudo a encontrarlo.`
      : catalog.document
        ? `¡Claro! 😊 Te adjunto el catálogo de ${catalog.label} 📚 (${catalog.count} productos con stock y foto).\n\n🌐 También puedes ver esa selección en nuestra tienda virtual:\n${catalog.url}\n\n¿Cuál te gustó? Te ayudo con el precio y la cantidad que necesites 🤝`
        : `Con gusto 😊 Por ahora no pude preparar el PDF de ${catalog.label}. Puedes revisar esa selección en nuestra tienda virtual 🛍️\n${catalog.url}\n\nSi me indicas el modelo que te interesa, revisamos su disponibilidad.`;
    else if (sources.length && plan.intent === "BUSINESS_QUERY") reply = "¡Claro! 😊 " + sources.map(source => source.text).join("\n");
    else if (sources.length && ["WARRANTY_QUERY", "DELIVERY_QUERY", "PAYMENT_QUERY"].includes(plan.intent)) reply = sources.slice(0, 2).map(s => s.text).join("\n\n");
    else if (products.length) {
      const facts = products.slice(0, 3).map(p => {
        // Match BC getUnitTier: ERP zero means no wholesale tier, not a free product.
        const wholesale = plan.quantity >= p.wholesaleMinQty && Boolean(p.wholesalePrice);
        const price = wholesale ? p.wholesalePrice! : p.unitPrice;
        return `🛍️ ${p.name}\nCódigo: ${p.code}\n💰 Precio por unidad: S/ ${price.toFixed(2)}${wholesale ? ` para ${plan.quantity} unidades` : ""}. 📦 Stock: ${p.stockUnits} unidades.${plan.quantity > p.stockUnits ? " La cantidad solicitada supera el stock actual." : ""}`;
      }).join("\n\n");
      reply = "¡Claro! 😊 Esto es lo que encontré:\n\n" + facts;
      if (plan.intent === "PRODUCT_COMPARISON") reply += products.length < plan.codes.length ? "\n\nNo encontré todos los códigos. Confirma los modelos para completar la comparación." : `\n\n${compareFacts(products).map(row => `${row.attribute}: ${row.values.map(v => `${v.code}: ${v.value}`).join(" / ")}`).join("\n") || "No hay atributos técnicos suficientes para afirmar ventajas entre estos modelos."}\n\n¿Para qué uso lo necesitas? La mejor opción depende de esa necesidad.`;
      else if (plan.intent === "PRICE_OBJECTION") reply = "Entiendo que el precio supera lo que esperabas. No tengo un descuento adicional confirmado.\n\n" + facts + "\n\n¿Cuál es tu presupuesto máximo?";
      else if (plan.intent === "PRODUCT_DETAILS") reply += /foto|imagen/i.test(input.text)
        ? `\n\n${products[0].imageUrl ? "Te muestro la foto del catálogo." : "No tengo una foto disponible de este producto."}\n¿Quieres comprarlo?`
        : `\n\n${products[0].technicalSpecs?.split(/[;\n]/).slice(0, 3).join(" · ") || "No tengo una ficha técnica verificada para ampliar esos datos."}\n¿Quieres comprarlo?`;
      else if (plan.intent === "PRODUCT_RECOMMENDATION") reply += "\n\n¿Con qué equipo lo usarás y qué característica es indispensable?";
      else if (plan.intent === "WHOLESALE_QUERY") reply += "\n\n¿Continuamos con esta cantidad? Escribe «quiero comprar».";
      else reply += products.length === 1 ? "\n\n¿Quieres comprarlo?" : products.length === 2 ? "\n\n¿Cuál eliges: el primero o el segundo?" : "\n\n¿Cuál eliges: el primero, segundo o tercero?";
      if (plan.needs.includes("Samsung") && ["PRODUCT_SEARCH", "PRODUCT_RECOMMENDATION"].includes(plan.intent)) reply += "\nIndícame el modelo de tu Samsung para verificar la compatibilidad antes de elegir.";
    } else if (!["GREETING", "FOLLOW_UP", "UNKNOWN"].includes(plan.intent)) reply = "Quiero ayudarte a encontrar el correcto 🔎 No encontré información suficiente para confirmar esa consulta. ¿Me compartes el modelo, el código o algún detalle más?";
    const sideQuestion = ["BUSINESS_QUERY", "DELIVERY_QUERY", "PAYMENT_QUERY", "WARRANTY_QUERY", "CATALOG_REQUEST", "GREETING", "FOLLOW_UP", "SALES_OBJECTION"].includes(plan.intent);
    const resumeCart = !["FOLLOW_UP", "SALES_OBJECTION"].includes(plan.intent) && (sideQuestion || ["PRODUCT_DETAILS", "PRICE_QUERY", "STOCK_QUERY"].includes(plan.intent));
    if (!requiresHuman && memory.cart && resumeCart) {
      const nextQuestion = checkoutPrompt(memory.cart);
      reply = reply.replace(/\n+¿Quieres comprarlo\?$/, "");
      if (nextQuestion) reply += `\n\n${nextQuestion}`;
    }
    const keepOptions = ["PRODUCT_DETAILS", "PRICE_QUERY", "STOCK_QUERY"].includes(plan.intent) && products.every(p => memory.shownCodes.includes(p.code));
    const next = memorySchema.parse({ ...memory, intent: plan.intent, productCodes: plan.codes.length ? plan.codes : products.length === 1 ? [products[0].code] : sideQuestion ? memory.productCodes : [], shownCodes: products.length && !keepOptions ? products.slice(0, 3).map(p => p.code) : memory.shownCodes,
      query: sideQuestion ? memory.query : plan.query, budget: sideQuestion ? memory.budget : plan.budget, quantity: sideQuestion ? memory.quantity : plan.quantity, needs: sideQuestion ? memory.needs : plan.needs,
      stage: requiresHuman ? "HANDOFF" : memory.cart ? "CLOSING" : plan.intent === "PRICE_OBJECTION" ? "OBJECTION" : plan.intent === "PRODUCT_COMPARISON" ? "COMPARISON" : "QUALIFICATION",
      asked: [...new Set([...memory.asked, ...(reply.includes("presupuesto máximo") ? ["budget"] : []), ...(reply.includes("¿Para qué uso") ? ["useCase"] : [])])].slice(-10),
    });
    return { rockyRequestId: randomUUID(), intent: plan.intent, skill: skill.name, confidence, confidenceEvidence: evidence,
      toolsRequested: executor.calls.map(c => c.name), toolCalls: executor.calls, products, sources, reply: reply.slice(0, 3900), requiresHuman, reasonCode,
      ...(catalog ? { catalog } : {}), memory: next, model, latencyMs: Date.now() - started, tokens, finalAction: requiresHuman ? "HANDOFF" : "SUGGEST" };
  }
}
