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

test("no divide un catálogo demasiado grande en varios PDF", async () => {
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
  assert.match(reply.text, /un solo PDF/i);
  assert.match(reply.text, /https:\/\/tiendavirtualsuper\.com\//);
});

test("uses the configured Messenger URL when Super Bot needs an adviser", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({ text: "" }),
    getMessengerUrl: async () => "https://m.me/atencion-configurada",
  });

  const reply = await answer({ message: "horario" });

  assert.equal(reply.quickActions?.[0]?.href, "https://m.me/atencion-configurada");
});

test("pide una identificación breve solo cuando no hay coincidencia en el catálogo", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => ({ text: "" }),
  });

  const reply = await answer({ message: "busco algo rarisimo" });

  assert.equal(reply.text, "No ubico ese producto. ¿Tienes foto, código o modelo?");
  assert.doesNotMatch(reply.text, /cantidad|para ayudarte mejor/i);
});

test("deriva una imagen sin texto a un asesor en lugar de inventar un producto", async () => {
  const answer = createSuperBotService({
    answerShopAssistant: async () => {
      throw new Error("Una imagen sin texto no debe buscar ni cotizar productos.");
    },
    getMessengerUrl: async () => "https://m.me/atencion-configurada",
  });

  const reply = await answer({ message: "", hasAttachments: true });

  assert.match(reply.text, /código o modelo/i);
  assert.equal(reply.meta?.intent, "attachment-human-assistance");
  assert.equal(reply.quickActions?.[0]?.href, "https://m.me/atencion-configurada");
});
