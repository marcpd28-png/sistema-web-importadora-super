import assert from "node:assert/strict";
import test from "node:test";

import { CatalogPdfSizeLimitError } from "./catalog-pdf";
import { createSuperBotService } from "./super-bot";

const generatedCatalog = {
  absoluteUrl: "https://tiendavirtualsuper.com/uploads/catalogs/catalogo-parlantes-0123456789abcdef.pdf",
  filename: "catalogo-parlantes-0123456789abcdef.pdf",
  generated: true,
  productCount: 12,
  relativeUrl: "/uploads/catalogs/catalogo-parlantes-0123456789abcdef.pdf",
  sizeBytes: 1_048_576,
};

const generatedCatalogBundle = {
  productCount: 45,
  documents: [
    generatedCatalog,
    {
      ...generatedCatalog,
      absoluteUrl: "https://tiendavirtualsuper.com/uploads/catalogs/catalogo-parlantes-0123456789abcdef-parte-2-de-2.pdf",
      filename: "catalogo-parlantes-0123456789abcdef-parte-2-de-2.pdf",
      relativeUrl: "/uploads/catalogs/catalogo-parlantes-0123456789abcdef-parte-2-de-2.pdf",
      productCount: 21,
    },
  ],
};

test("genera un único PDF para cada solicitud de catálogo específico", async () => {
  const requests = [
    "Hola catálogo de parlantes",
    "catalogos de parlantes",
    "cata parlantes",
    "catallgos específicos de parlantes",
  ];

  for (const message of requests) {
    let generationCount = 0;
    const answer = createSuperBotService({
      answerShopAssistant: async () => {
        throw new Error("Una solicitud de catálogo específico no debe buscar productos por separado.");
      },
      generateCatalogPdf: async (request) => {
        generationCount += 1;
        assert.deepEqual(request.terms, ["parlantes"]);
        return generatedCatalog;
      },
    });

    const reply = await answer({ message });

    assert.equal(generationCount, 1, message);
    assert.equal(reply.document?.url, generatedCatalog.absoluteUrl);
    assert.equal(reply.document?.deliveryKey, `catalog:${generatedCatalog.filename}`);
    assert.equal(reply.meta?.intent, "catalog-pdf");
    assert.equal(reply.quickActions?.filter((action) => action.href === generatedCatalog.absoluteUrl).length, 1);
  }
});

test("entrega un bundle completo y ordenado cuando un catálogo necesita varias partes", async () => {
  const answer = createSuperBotService({
    generateCatalogPdfBundle: async (request) => {
      assert.deepEqual(request.terms, ["parlantes"]);
      return generatedCatalogBundle;
    },
  });

  const reply = await answer({ message: "catálogo de parlantes" });

  assert.deepEqual(reply.documents?.map((document) => document.filename), generatedCatalogBundle.documents.map((document) => document.filename));
  assert.equal(reply.document?.filename, generatedCatalogBundle.documents[0].filename);
  assert.match(reply.text, /45 productos/i);
  assert.match(reply.text, /2 PDFs/i);
  assert.equal(reply.quickActions?.[0]?.href, generatedCatalogBundle.documents[0].absoluteUrl);
});

test("comparte el PDF completo al querer comprar cámaras de seguridad en plural", async () => {
  let receivedRequest: { terms: string[]; source?: string } | undefined;
  const answer = createSuperBotService({
    answerShopAssistant: async () => {
      throw new Error("La intención comercial debe preparar el PDF antes de buscar tarjetas.");
    },
    generateCatalogPdf: async (request) => {
      receivedRequest = request;
      return generatedCatalog;
    },
  });

  const reply = await answer({ message: "Quisiera adquirir cámaras de seguridad" });

  assert.deepEqual(receivedRequest, {
    terms: ["camaras", "seguridad"],
    slug: "camaras-seguridad",
    title: "CATÁLOGO DE CÁMARAS DE SEGURIDAD",
    source: "security-camera-purchase",
  });
  assert.equal(reply.document?.url, generatedCatalog.absoluteUrl);
  assert.equal(reply.meta?.intent, "catalog-pdf");
  assert.match(reply.text, /por supuesto.*catálogo completo de cámaras de seguridad/i);
});

test("no entrega un catálogo parcial cuando ni una parte cabe dentro del límite", async () => {
  let generationCount = 0;
  const answer = createSuperBotService({
    generateCatalogPdf: async () => {
      generationCount += 1;
      throw new CatalogPdfSizeLimitError();
    },
  });

  const reply = await answer({ message: "catálogo de parlantes" });

  assert.equal(generationCount, 1);
  assert.equal(reply.document, undefined);
  assert.equal(reply.documents, undefined);
  assert.match(reply.text, /tamaño permitido/i);
  assert.match(reply.text, /https:\/\/tiendavirtualsuper\.com\//);
});

test("ofrece alternativas verificadas cuando no hay stock de la potencia exacta", async () => {
  let alternativeQuery = "";
  const answer = createSuperBotService({
    generateCatalogPdfBundle: async () => {
      throw new Error("No encontramos productos publicados para el catálogo de estaciones energia 2500w.");
    },
    answerShopAssistant: async (input) => {
      alternativeQuery = input.message;
      return {
        text: "Tenemos alternativas.",
        products: [{
          id: "cp600", slug: "ecoflow-delta-3-max", code: "CP600", name: "Estación de Energía EcoFlow Delta 3 Max 2400 W", description: null,
          brand: "EcoFlow", category: "Estaciones de energía", imageUrl: "/cp600.jpg", imageAlt: "EcoFlow Delta 3 Max",
          unitPrice: "S/ 6,999.00", unitPriceValue: 6999, wholesalePrice: null, wholesalePriceValue: null,
          wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 2, unitsPerBox: null,
        }],
      };
    },
    composeLiveReply: async () => {
      throw new Error("Las alternativas verificadas no deben reescribirse.");
    },
  });

  const reply = await answer({ message: "Me podría mostrar el catálogo de estaciones de energía de 2500 watts y sus costos" });

  assert.equal(alternativeQuery, "estaciones energia");
  assert.equal(reply.document, undefined);
  assert.equal(reply.products?.[0]?.code, "CP600");
  assert.match(reply.text, /no tenemos disponible.*2500 W/i);
  assert.match(reply.text, /EcoFlow Delta 3 Max 2400 W.*S\/ 6,999.00/i);
});

test("el catálogo general saluda y entrega el video junto con la tienda virtual", async () => {
  let composeCalls = 0;
  const answer = createSuperBotService({
    answerShopAssistant: async () => {
      throw new Error("El catálogo general no debe pasar por una búsqueda de productos.");
    },
    composeLiveReply: async () => {
      composeCalls += 1;
      throw new Error("Los enlaces aprobados del catálogo general no deben reescribirse.");
    },
  });

  for (const message of ["catálogo", "catálogo general", "Quiero el catálogo completo, por favor", "catalgo virtual"]) {
    const reply = await answer({ message, isFirstContact: true });
    assert.equal(reply.meta?.intent, "catalog-link", message);
    assert.match(reply.text, /^👋 ¡Hola!/, message);
    assert.match(reply.text, /🎬 Te comparto un video corto/, message);
    assert.doesNotMatch(reply.text, /recorrido-tienda-virtual-importaciones-super/);
    assert.match(reply.text, /https:\/\/tiendavirtualsuper\.com\/$/, message);
    assert.deepEqual(reply.quickActions?.map((action) => action.label), ["🛍️ Ver tienda virtual"], message);
    assert.equal(reply.videos?.[0]?.url, "https://tiendavirtualsuper.com/uploads/communications/recorrido-tienda-virtual-importaciones-super-messenger-v2.mp4", message);
    assert.equal(reply.videos?.[0]?.mimeType, "video/mp4", message);
  }
  assert.equal(composeCalls, 0);

  const repeatReply = await answer({ message: "catálogo", isFirstContact: false });
  assert.doesNotMatch(repeatReply.text, /¡Hola!/, "no debe volver a saludar en una conversación existente");
  assert.doesNotMatch(repeatReply.text, /recorrido-tienda-virtual-importaciones-super\.mp4/);
  assert.equal(repeatReply.videos, undefined);
  assert.deepEqual(repeatReply.quickActions?.map((action) => action.label), ["🛍️ Ver tienda virtual"]);
});

test("uses the configured Messenger URL when Super Bot needs an adviser", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({ text: "" }),
    getMessengerUrl: async () => "https://m.me/atencion-configurada",
  });

  const reply = await answer({ message: "horario" });

  assert.equal(reply.quickActions?.[0]?.href, "https://m.me/atencion-configurada");
});

test("prioriza tarjetas visuales y deja solo una pregunta breve después", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({
      text: "Esta respuesta extensa no debe acompañar las tarjetas.",
      products: [
        {
          id: "p-1", slug: "parlante-1", code: "PAR-1", name: "Parlante 1", description: "Descripción extensa.",
          brand: null, category: "Audio", imageUrl: "/producto.jpg", imageAlt: "Parlante 1",
          unitPrice: "S/ 99.00", unitPriceValue: 99, wholesalePrice: null, wholesalePriceValue: null,
          wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 4, unitsPerBox: null,
        },
        {
          id: "p-2", slug: "parlante-2", code: "PAR-2", name: "Parlante 2", description: "Otra descripción.",
          brand: null, category: "Audio", imageUrl: "/producto-2.jpg", imageAlt: "Parlante 2",
          unitPrice: "S/ 129.00", unitPriceValue: 129, wholesalePrice: null, wholesalePriceValue: null,
          wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 2, unitsPerBox: null,
        },
      ],
      channelActions: [{ kind: "show-more", label: "Ver más opciones", message: "Muéstrame más opciones" }],
    }),
  });

  const reply = await answer({ message: "Busco parlantes" });

  assert.equal(reply.products?.length, 2);
  assert.equal(reply.text, "Mira las opciones. ¿Cuál buscas o quieres ver más?");
});

test("conserva la respuesta verificada cuando un producto incluye delivery", async () => {
  let composerCalled = false;
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({
      text: "Cooler Glacier disponible. El costo de delivery a tu zona lo cotiza un asesor.",
      products: [{
        id: "pc31", slug: "cooler-glacier", code: "PC31-SQ", name: "Cooler para Laptop Glacier", description: null,
        brand: null, category: "Accesorios PC", imageUrl: "/cooler.jpg", imageAlt: "Cooler Glacier",
        unitPrice: "S/ 79.00", unitPriceValue: 79, wholesalePrice: null, wholesalePriceValue: null,
        wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 34, unitsPerBox: null,
      }],
    }),
    composeLiveReply: async () => {
      composerCalled = true;
      throw new Error("La IA no debe reescribir la política de delivery.");
    },
  });

  const reply = await answer({ message: "¿Hacen delivery del Cooler para laptop Glacier?" });

  assert.equal(composerCalled, false);
  assert.equal(reply.products?.[0]?.code, "PC31-SQ");
  assert.match(reply.text, /costo de delivery.*asesor/i);
});

test("conserva una cotización calculada aunque incluya la tarjeta del producto", async () => {
  const quote = "La mejor opción es Parlante 1. Ya aplica mayorista: S/ 79.00 c/u. Total estimado por 3: S/ 237.00.";
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({
      text: quote,
      contextProductCode: "PAR-1",
      products: [{
        id: "p-1", slug: "parlante-1", code: "PAR-1", name: "Parlante 1", description: null,
        brand: null, category: "Audio", imageUrl: "/producto.jpg", imageAlt: "Parlante 1",
        unitPrice: "S/ 99.00", unitPriceValue: 99, wholesalePrice: "S/ 79.00", wholesalePriceValue: 79,
        wholesaleMinQty: 3, availabilityLabel: "Disponible", stockUnits: 4, unitsPerBox: null,
      }],
    }),
    composeLiveReply: async (input) => input.verifiedReply,
  });

  const reply = await answer({ message: "3", productContextCode: "PAR-1" });

  assert.equal(reply.text, quote);
  assert.doesNotMatch(reply.text, /carrito|drawer/i);
});

test("una confirmación frente al siguiente lote conserva la búsqueda y avanza solo el siguiente lote", async () => {
  let receivedMessage = "";
  const answer = createSuperBotService({
    answerShopAssistant: async (input) => {
      receivedMessage = input.message;
      return {
        text: "Aquí van 2 más. ¿Quieres ver el siguiente lote?",
        products: [
          { id: "p-6", slug: "jbl-6", code: "JBL-6", name: "Parlante JBL 6", description: null, brand: "JBL", category: "Parlantes", imageUrl: "/6.jpg", imageAlt: "Parlante JBL 6", unitPrice: "S/ 1", unitPriceValue: 1, wholesalePrice: null, wholesalePriceValue: null, wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 3, unitsPerBox: null },
          { id: "p-7", slug: "jbl-7", code: "JBL-7", name: "Parlante JBL 7", description: null, brand: "JBL", category: "Parlantes", imageUrl: "/7.jpg", imageAlt: "Parlante JBL 7", unitPrice: "S/ 1", unitPriceValue: 1, wholesalePrice: null, wholesalePriceValue: null, wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 3, unitsPerBox: null },
        ],
      };
    },
  });

  const reply = await answer({
    message: "Sí, quiero verlos",
    shownProductCodes: ["JBL-1", "JBL-2", "JBL-3", "JBL-4", "JBL-5"],
    recentMessages: [
      { role: "user", text: "Hola, ¿tienen parlantes JBL?" },
      { role: "assistant", text: "Aquí van 5 más. ¿Quieres ver el siguiente lote?" },
    ],
  });

  assert.equal(receivedMessage, "Muéstrame más opciones");
  assert.deepEqual(reply.products?.map((product) => product.code), ["JBL-6", "JBL-7"]);
  assert.doesNotMatch(reply.text, /precio|jbl-6/i);
});

test("al interesarse por un producto informa pagos y entrega a un asesor", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => {
      throw new Error("Una selección no debe repetir la búsqueda de catálogo.");
    },
    getMessengerUrl: async () => "https://m.me/atencion-configurada",
  });

  const reply = await answer({ message: "Me interesa ese producto" });

  assert.match(reply.text, /tarjeta o Yape.*Interbank o Plin/i);
  assert.match(reply.text, /asesor continuará/i);
  assert.equal(reply.quickActions?.[0]?.href, "https://m.me/atencion-configurada");
  assert.equal(reply.meta?.intent, "payment");
});

test("deriva una consulta sin coincidencia sin enviar una respuesta automática", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({ text: "" }),
  });

  const reply = await answer({ message: "busco algo rarisimo" });

  assert.equal(reply.text, "");
  assert.equal(reply.meta?.intent, "human-assistance");
  assert.equal(reply.meta?.requiresAdvisor, true);
});

test("deriva una imagen sin texto a Pendientes sin inventar ni responder", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => {
      throw new Error("Una imagen sin texto no debe buscar ni cotizar productos.");
    },
    getMessengerUrl: async () => "https://m.me/atencion-configurada",
  });

  const reply = await answer({ message: "", hasAttachments: true });

  assert.equal(reply.text, "");
  assert.equal(reply.meta?.intent, "attachment-human-assistance");
  assert.equal(reply.meta?.requiresAdvisor, true);
  assert.equal(reply.quickActions, undefined);
});

test("una imagen validada identifica solo una tarjeta verificada del catálogo", async () => {
  const answer = createSuperBotService({
    matchProductImage: async (imageDataUrl) => {
      assert.match(imageDataUrl, /^data:image\/jpeg;base64,/);
      return {
        status: "matched",
        productIsSellable: true,
        confidence: 0.94,
        reason: null,
        product: {
          id: "p-jbl-go4", slug: "jbl-go-4", code: "JBL-GO4", name: "Parlante JBL GO 4", description: null,
          brand: "JBL", category: "Parlantes", imageUrl: "/jbl-go4.jpg", imageAlt: "Parlante JBL GO 4",
          unitPrice: "S/ 199.00", unitPriceValue: 199, wholesalePrice: null, wholesalePriceValue: null,
          wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 8, unitsPerBox: null,
        },
      };
    },
    composeLiveReply: async (input) => input.verifiedReply,
  });

  const reply = await answer({ message: "", hasAttachments: true, imageDataUrl: "data:image/jpeg;base64,/9j/" });
  assert.equal(reply.meta?.intent, "image-match");
  assert.equal(reply.products?.[0]?.code, "JBL-GO4");
  assert.match(reply.text, /identifiqué parlante jbl go 4/i);
});

test("una petición explícita de asesor se deriva sin acuse automático", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({ text: "" }),
  });

  const reply = await answer({ message: "quiero hablar con un asesor" });

  assert.equal(reply.text, "");
  assert.equal(reply.meta?.intent, "human-assistance");
  assert.equal(reply.meta?.requiresAdvisor, true);
});

test("entrega el estado confiable de primer contacto y la respuesta verificada al compositor en vivo", async () => {
  let received: { isFirstContact?: boolean; message: string; history?: number; verifiedText: string } | undefined;
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({ text: "Producto verificado." }),
    composeLiveReply: async (input) => {
      received = {
        isFirstContact: input.isFirstContact,
        message: input.message,
        history: input.recentMessages?.length,
        verifiedText: input.verifiedReply.text,
      };
      return { ...input.verifiedReply, text: "Respuesta breve." };
    },
  });

  const reply = await answer({
    message: "Busco un producto",
    isFirstContact: true,
    recentMessages: [{ role: "user", text: "Hola" }],
  });

  assert.deepEqual(received, {
    isFirstContact: true,
    message: "Busco un producto",
    history: 1,
    verifiedText: "Producto verificado.",
  });
  assert.equal(reply.text, "Respuesta breve.");
});
