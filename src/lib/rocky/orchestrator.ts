import { learningText } from "./learning";
import { buildRockyContext, scopedKnowledge, knowledgeConflicts, type MediaContext } from "./context";
import { evaluateConfidence } from "./confidence";
import { summarizeMemory } from "./memory";
import { classifyIntent } from "./intent";
import { matchesRequestedModel, matchesRequestedType } from "./model-match";
import { customerQuestions } from "./customer-questions";
import { randomUUID } from "node:crypto";
import { memorySchema, planSchema, type LLMProvider, type ProductFact, type RockyMemory, type RockyResult } from "./contracts";
import { detectPlan } from "./planning";
import { selectSkill } from "./skills";
import { ToolExecutor, type ToolBackend, type ToolName } from "./tools";
import { compareFacts } from "./sales";
import { checkoutPrompt } from "./checkout";
import { createCatalogIndex } from "../catalog-selection";
import { parseCommercialQuery } from "../commercial-query";

export class RockyAIOrchestrator {
  constructor(private backend: ToolBackend, private provider?: LLMProvider) {}
  async chat(input: { text: string; media?: MediaContext; memory?: RockyMemory; history?: string[]; image?: string; resolvedProductCode?: string; resolvedProductCodes?: string[] }): Promise<RockyResult> {
    const intent = detectPlan(input.text, input.memory).intent;
    const parts = !input.image && !["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "ORDER_STATUS", "PRODUCT_COMPATIBILITY", "CATALOG_REQUEST"].includes(intent) ? customerQuestions(input.text) : [];
    if (parts.length < 2) return this.singleChat(input);
    const started = Date.now();
    let memory = input.memory;
    const results: RockyResult[] = [];
    for (const part of parts) {
      // Labels route each independent topic; no recursive splitting or model-authored tools.
      const result = await this.singleChat({ ...input, text: part.text, memory, topicIntent: part.intent });
      results.push(result); memory = result.memory;
    }
    const first = results[0];
    const requiresHuman = results.some(result => result.requiresHuman);
    const sections = results.map((result, index) => {
      let reply = result.reply.replace(/^¡Claro! 😊\s*|^Con gusto 😊\s*/, "").replace(/\n\n¿(?:Quieres comprarlo|Cuál eliges)[\s\S]*$/, "");
      if (result.memory.cart) reply = reply.replace(`\n\n${checkoutPrompt(result.memory.cart)}`, "");
      if (result.requiresHuman && !result.sources.length) reply = "Necesito que un asesor confirme esta información.";
      return `${parts[index].label}: ${reply}`;
    });
    const resume = !requiresHuman && memory?.cart && !sections.some(section => section.includes("¿")) ? checkoutPrompt(memory.cart) : "";
    const reply = [...sections, ...(resume ? [resume] : [])].join("\n\n").slice(0, 3900);
    const combinedSources = [...new Map(results.flatMap(result => result.sources).map(source => [source.id, source])).values()];
    return { ...first, reply, requiresHuman,
      interaction: { customerMessage: learningText(input.text), finalResponse: learningText(reply),
        modelResponse: first.interaction?.modelResponse || null, createdAt: first.interaction?.createdAt || new Date().toISOString() },
      confidenceSignals: first.confidenceSignals ? { ...first.confidenceSignals,
        toolSuccess: results.every(result => result.toolCalls.every(call => call.ok)),
        ambiguity: results.some(result => result.confidenceSignals?.ambiguity),
        contradiction: results.some(result => result.confidenceSignals?.contradiction),
        productMatch: results.every(result => result.confidenceSignals?.productMatch),
        retrievalScore: combinedSources.length ? Math.max(...combinedSources.map(source => source.score)) : null } : undefined,
      reasonCode: requiresHuman ? "PARTIAL_INFORMATION_REQUIRES_REVIEW" : first.reasonCode,
      finalAction: requiresHuman ? "HANDOFF" : "SUGGEST", confidence: Math.min(...results.map(result => result.confidence)),
      memory: memorySchema.parse({ ...memory, ...(requiresHuman ? { stage: "HANDOFF" } : {}) }),
      products: [...new Map(results.flatMap(result => result.products).map(product => [product.id, product])).values()],
      sources: combinedSources,
      toolsRequested: results.flatMap(result => result.toolsRequested), toolCalls: results.flatMap(result => result.toolCalls),
      confidenceEvidence: [...new Set(results.flatMap(result => result.confidenceEvidence))],
      tokens: results.some(result => result.tokens) ? { input: results.reduce((n, result) => n + (result.tokens?.input || 0), 0), output: results.reduce((n, result) => n + (result.tokens?.output || 0), 0) } : null,
      model: results.find(result => result.tokens)?.model || first.model, latencyMs: Date.now() - started };
  }
  private async singleChat(input: { text: string; media?: MediaContext; memory?: RockyMemory; history?: string[]; image?: string; resolvedProductCode?: string; resolvedProductCodes?: string[]; topicIntent?: import("./contracts").RockyPlan["intent"] }): Promise<RockyResult> {
    const started = Date.now();
    const memory = input.memory || memorySchema.parse({});
    let plan = detectPlan(input.text, memory);
    if (input.topicIntent) plan.intent = input.topicIntent;
    if (input.resolvedProductCode && !plan.codes.length && ["UNKNOWN", "PRODUCT_SEARCH", "PRODUCT_DETAILS", "FOLLOW_UP", "PRICE_QUERY", "STOCK_QUERY", "WHOLESALE_QUERY"].includes(plan.intent)) {
      plan.codes = [input.resolvedProductCode];
      if (["UNKNOWN", "FOLLOW_UP", "PRODUCT_SEARCH"].includes(plan.intent)) plan.intent = "PRODUCT_DETAILS";
    }
    if (input.resolvedProductCodes?.length && ["UNKNOWN", "PRODUCT_SEARCH", "PRODUCT_DETAILS", "FOLLOW_UP", "PRICE_QUERY", "STOCK_QUERY", "WHOLESALE_QUERY"].includes(plan.intent)) {
      plan.codes = input.resolvedProductCodes.slice(0, 6);
      plan.intent = "PRODUCT_DETAILS";
    }
    let modelPlan: import("./contracts").RockyPlan | null = null;
    let tokens: RockyResult["tokens"] = null;
    let model = "rules-and-tools";
    let reasonCode: string | null = null;
    // An unrecognized product name can be resolved by current catalog evidence,
    // even when the model is unavailable. Do not search images or known service intents.
    const catalogLookup = new ToolExecutor(this.backend, selectSkill("PRODUCT_SEARCH").tools);
    let namedSearch: { query: string; result: Awaited<ReturnType<ToolExecutor["execute"]>> } | undefined;
    let catalogMatchedIntent = false;
    let refinedQuery = false;
    if (plan.intent === "UNKNOWN" && plan.query && !input.image && !/https?:\/\/|@/.test(plan.query)) {
      try {
        const previousQuery = !memory.cart && memory.shownCodes.length ? memory.query : "";
        const fragment = parseCommercialQuery(plan.query);
        const constraintOnly = !fragment.text && (fragment.constraints.measurements.length > 0 || fragment.constraints.colors.length > 0);
        const refine = () => {
          const combined = `${previousQuery} ${plan.query}`;
          if (!previousQuery || combined.length > 120) return;
          plan = { ...plan, intent: "PRODUCT_SEARCH", query: combined, codes: [], quantity: memory.quantity, budget: memory.budget, needs: memory.needs };
          refinedQuery = true;
        };
        if (constraintOnly) refine();
        let result = await catalogLookup.execute("searchProducts", { query: plan.query, budget: plan.budget });
        let selection = createCatalogIndex(result.products).select(plan.query);
        // A catalog-backed qualifier refines the previous product, including brands
        // stored only in names. A newly named product type starts a new search.
        if (!refinedQuery && previousQuery && selection.products.length && !selection.categories.length && !selection.types.length) {
          refine();
          if (refinedQuery) {
            result = await catalogLookup.execute("searchProducts", { query: plan.query, budget: plan.budget });
            selection = createCatalogIndex(result.products).select(plan.query);
          }
        }
        const ids = new Set(selection.scoped ? selection.products.map(p => p.code) : []);
        result.products = result.products.filter(p => ids.has(p.code) && matchesRequestedModel(plan.query, p));
        namedSearch = { query: plan.query, result };
        if (result.products.length) {
          plan.intent = "PRODUCT_SEARCH";
          catalogMatchedIntent = true;
        }
      } catch { /* The normal planner/fallback remains available if the catalog fails. */ }
    }
    const needsReference = !input.image && !plan.codes.length && !plan.query && ["PRODUCT_SEARCH", "PRODUCT_DETAILS", "PRICE_QUERY", "STOCK_QUERY", "WHOLESALE_QUERY", "PRODUCT_COMPARISON"].includes(plan.intent);
    // High risk requests are decided before consulting the model.
    const exactToolRequest = plan.codes.length > 0 && ["STOCK_QUERY", "PRICE_QUERY", "PRODUCT_COMPARISON", "WHOLESALE_QUERY", "PRODUCT_DETAILS"].includes(plan.intent);
    if (this.provider && !needsReference && !exactToolRequest && (plan.intent === "UNKNOWN" || Boolean(input.image)) && !["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "ORDER_STATUS", "BUSINESS_QUERY"].includes(plan.intent)) {
      try {
        // Optional retrieval must not prevent deterministic handling or model fallback.
        const reviewedExamples = await this.backend.reviewedExamples?.(input.text).catch(() => []) || [];
        const generated = await this.provider.plan(buildRockyContext({ ...input, memory, reviewedExamples }));
        tokens = generated.tokens; model = this.provider.model;
        // An uncertain model cannot override safety or explicit deterministic product/budget extraction.
        const proposed = planSchema.parse(generated.plan);
        modelPlan = proposed;
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
    const catalogProblem = plan.intent === "CATALOG_REQUEST" && /no (?:puedo|se puede|me deja) abrir|no (?:lo )?encuentro|no me (?:sale|aparece)/i.test(input.text);
    const products: ProductFact[] = []; const sources: RockyResult["sources"] = [];
    let requiresHuman = ["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "ORDER_STATUS"].includes(plan.intent);
    let contradiction = false;
    const call = async (name: ToolName, args: unknown) => {
      const result = name === "searchProducts" && namedSearch && namedSearch.query === (args as { query?: string }).query
        ? namedSearch.result : await executor.execute(name, args);
      for (const product of result.products) {
        const previous = products.find(p => p.id === product.id);
        if (previous && (previous.unitPrice !== product.unitPrice || previous.stockUnits !== product.stockUnits || previous.technicalSpecs !== product.technicalSpecs)) contradiction = true;
      }
      for (const product of result.products) if (matchesRequestedType(plan.query, product) && (plan.codes.includes(product.code) || (plan.codes.length > 1 ? plan.codes.some(code => matchesRequestedModel(code, product)) : matchesRequestedModel(plan.query, product))) && !products.some(p => p.id === product.id) && (!(["PRODUCT_SEARCH", "PRODUCT_RECOMMENDATION"].includes(plan.intent) && plan.budget !== null) || product.unitPrice <= plan.budget!)) products.push(product);
      sources.push(...(name === "searchKnowledge" && (args as { productId?: string }).productId
        ? scopedKnowledge(result.sources, [(args as { productId: string }).productId]) : result.sources));
      if (result.catalog) catalog = result.catalog;
    };
    try {
      if (plan.intent === "CATALOG_REQUEST") {
        await call("getCatalog", { query: catalogProblem ? "catálogo completo" : input.text });
      } else if (plan.intent === "BUSINESS_QUERY") {
        await call("getBusinessInfo", { query: input.text.slice(0, 120) });
        if (!sources.length) { requiresHuman = true; reasonCode = "BUSINESS_INFO_NOT_CONFIGURED"; }
      } else if (skill.tools.includes("handoffToHuman")) await call("handoffToHuman", { reasonCode: plan.intent });
      else if (["WARRANTY_QUERY", "DELIVERY_QUERY", "PAYMENT_QUERY", "RETURN_QUERY"].includes(plan.intent)) {
        const sourceType = { WARRANTY_QUERY: "WARRANTY", DELIVERY_QUERY: "DELIVERY", PAYMENT_QUERY: "PAYMENT", RETURN_QUERY: "RETURN" }[plan.intent as "WARRANTY_QUERY"];
        if (plan.intent === "WARRANTY_QUERY" && plan.codes.length === 1) await call("getProductByCode", { code: plan.codes[0] });
        await call("searchKnowledge", { query: input.text.slice(0, 120), sourceType, ...(products.length === 1 ? { productId: products[0].id } : {}) });
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
        if (plan.intent === "PRICE_OBJECTION" && (memory.query || plan.query)) await call("searchProducts", { query: memory.query || plan.query, budget: plan.budget });
      } else if (plan.query && skill.tools.includes("searchProducts") && !["GREETING", "UNKNOWN", "FOLLOW_UP"].includes(plan.intent)) {
        await call("searchProducts", { query: plan.query, budget: plan.budget });
        if (!products.length && !refinedQuery && skill.tools.includes("searchKnowledge")) {
          await call("searchKnowledge", { query: plan.query });
          // RAG may identify a product, but its price and stock are always reloaded from the backend.
          for (const source of sources.filter(s => s.productId).slice(0, 3)) {
            await call("getProduct", { code: source.productId! });
          }
        }
      }
    } catch { requiresHuman = true; reasonCode = "TOOL_FAILED"; }
    if (contradiction) { requiresHuman = true; reasonCode = "CONTRADICTORY_TOOL_DATA"; }
    if (plan.intent === "PRODUCT_DETAILS" && products.length === 1 && !products[0].technicalSpecs && skill.tools.includes("searchKnowledge")) {
      try { await call("searchKnowledge", { query: input.text.slice(0, 120), productId: products[0].id }); }
      catch { /* Verified product facts remain usable; missing specifications are stated explicitly. */ }
    }
    if (knowledgeConflicts(sources)) { contradiction = true; requiresHuman = true; reasonCode = "CONTRADICTORY_KNOWLEDGE"; }
    if (plan.intent === "PRODUCT_COMPATIBILITY") { requiresHuman = true; reasonCode = "COMPATIBILITY_REQUIRES_VERIFICATION"; }
    if (plan.intent === "ORDER_STATUS") reasonCode = "IDENTITY_VERIFICATION_REQUIRED";
    if (["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY"].includes(plan.intent)) reasonCode = plan.intent;
    const exact = plan.codes.length > 0 && plan.codes.every(code => products.some(p => p.code.toUpperCase() === code.toUpperCase()));
    const calls = [...catalogLookup.calls, ...executor.calls];
    const evidence = [catalogMatchedIntent ? "CATALOG_MATCHED_INTENT" : "RULE_BASED_INTENT", ...(refinedQuery ? ["CATALOG_QUERY_REFINED"] : []), ...(exact ? ["EXACT_PRODUCT_MATCH"] : []), ...(products.length ? ["CURRENT_BACKEND_DATA"] : []), ...(sources.length ? ["APPROVED_KNOWLEDGE"] : []), ...(calls.some(c => !c.ok) ? ["TOOL_FAILURE"] : [])];
    const evaluated = evaluateConfidence({ intent: plan.intent, exact, products: products.length, sources, calls, requiresHuman, ambiguous: needsReference, contradiction });
    const confidence = evaluated.score;
    evidence.push(...evaluated.evidence);
    // Deliberately render commercial assertions from evidence, never from unconstrained LLM prose.
    let reply = "Con gusto te ayudo 😊 ¿Qué producto buscas y para qué lo vas a utilizar? Puedes indicarme el código o tu presupuesto.";
    if (needsReference) reply = memory.shownCodes.length > 1 ? "¿Cuál de las opciones te interesa? Dime el código o si es la primera, segunda o tercera." : /\bcaja|\bpor\s+\d+/i.test(input.text) ? "¿De qué producto necesitas el precio por cantidad? Dime el nombre o el código." : "¿De qué producto necesitas información? Dime el nombre o el código.";
    else if (plan.intent === "GREETING") reply = memory.productCodes.length || memory.cart ? "Hola de nuevo. Seguimos con tu consulta." : "¡Hola! Soy Rocky, de Importadora Super 😊 ¿Qué producto buscas?";
    else if (requiresHuman) reply = plan.intent === "HUMAN_REQUEST" ? "Claro 😊 Te paso con un asesor para que pueda ayudarte." : "Quiero darte información correcta 😊 Necesito que un asesor verifique esta consulta. Dejo registrada tu solicitud para que te ayude.";
    else if (plan.intent === "SALES_OBJECTION") reply = "Claro, tómate tu tiempo. ¿Qué duda te falta resolver para decidir?";
    else if (plan.intent === "FOLLOW_UP") reply = memory.awaitingQuantity
      ? memory.pendingPurchaseQuantity ? "¿Qué producto eliges? Dime el código o una de las opciones." : "¿Cuántas unidades llevas?"
      : memory.cart ? `Conservamos tu compra. ${checkoutPrompt(memory.cart)}`
      : memory.productCodes.length === 1 ? "Con gusto 😊 Si deseas comprarlo, dime cuántas unidades necesitas." : "Con gusto 😊 ¿Qué producto te interesa?";
    else if (catalogProblem && catalog) reply = `Puedes abrir el catálogo aquí:\n${catalog.url}\n\n¿Te aparece un error al abrirlo o no encuentras un producto?`;
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
      else if (plan.intent === "PROMOTION_QUERY") reply = "No tengo una promoción vigente verificada. Estos son los precios consultados en la tienda:\n\n" + facts;
      else if (plan.intent === "PRODUCT_DETAILS") reply += /foto|imagen/i.test(input.text)
        ? `\n\n${products[0].imageUrl ? "Te muestro la foto del catálogo." : "No tengo una foto disponible de este producto."}\n¿Quieres comprarlo?`
        : `\n\n${products[0].technicalSpecs?.split(/[;\n]/).slice(0, 3).join(" · ") || sources.filter(source => source.productId === products[0].id && ["PRODUCT", "MANUAL", "FAQ"].includes(source.sourceType) && !/precio|stock|promoci[oó]n|S\//i.test(source.text)).slice(0, 1).map(source => source.text).join("") || "No tengo una ficha técnica verificada para ampliar esos datos."}\n¿Quieres comprarlo?`;
      else if (plan.intent === "PRODUCT_RECOMMENDATION") reply += "\n\n¿Con qué equipo lo usarás y qué característica es indispensable?";
      else if (plan.intent === "WHOLESALE_QUERY") reply += "\n\n¿Continuamos con esta cantidad? Escribe «quiero comprar».";
      else reply += products.length === 1 ? "\n\n¿Quieres comprarlo?" : products.length === 2 ? "\n\n¿Cuál eliges: el primero o el segundo?" : "\n\n¿Cuál eliges: el primero, segundo o tercero?";
      if (/\b(?:caja|paquete|docena)s?\b/i.test(input.text) && /precio|cuanto|cuánto|costo/i.test(input.text)) {
        reply = reply.replace(/\n\n¿(?:Quieres comprarlo|Cuál eliges)[\s\S]*$/, "");
        reply += "\n\nEl precio mostrado es por unidad. Necesito confirmar la presentación y el precio por caja con un asesor.";
        requiresHuman = true; reasonCode = "PACKAGE_QUOTE_REQUIRES_VERIFICATION";
      }
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
    return { rockyRequestId: randomUUID(), intent: plan.intent, skill: skill.name, confidence: requiresHuman ? Math.min(confidence, 0.3) : confidence, confidenceEvidence: evidence,
      toolsRequested: calls.map(c => c.name), toolCalls: calls, products, sources, reply: reply.slice(0, 3900), requiresHuman, reasonCode,
      classification: classifyIntent(input.text, memory, plan, Boolean(input.image || input.media && input.media.type !== "TEXT")), confidenceSignals: evaluated.signals,
      interaction: { customerMessage: learningText(input.text), modelResponse: modelPlan ? { ...plan, query: learningText(plan.query), needs: plan.needs.map(learningText) } : null, finalResponse: learningText(reply.slice(0, 3900)), createdAt: new Date().toISOString() },
      ...(catalog ? { catalog } : {}), memory: summarizeMemory(next, plan.intent, input.text), model, latencyMs: Date.now() - started, tokens, finalAction: requiresHuman ? "HANDOFF" : "SUGGEST" };
  }
}
