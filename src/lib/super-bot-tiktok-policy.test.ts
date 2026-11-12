import assert from "node:assert/strict";
import test from "node:test";

import { createSuperBotService } from "./super-bot";

test("the TikTok PDF policy reaches the complete catalogue generator", async () => {
  let receivedMaxBytes: number | undefined;
  const answer = createSuperBotService({
    generateCatalogPdfBundle: async (_request, options) => {
      receivedMaxBytes = options?.maxBytes;
      return {
        productCount: 1,
        documents: [{
          absoluteUrl: "https://tiendavirtualsuper.com/uploads/catalogs/catalogo-ventiladores.pdf",
          filename: "catalogo-ventiladores.pdf",
          generated: true,
          productCount: 1,
          relativeUrl: "/uploads/catalogs/catalogo-ventiladores.pdf",
          sizeBytes: 1024,
        }],
      };
    },
  });

  const reply = await answer({
    message: "catálogo de ventiladores",
    catalogPdfMaxBytes: 5 * 1024 * 1024,
  });

  assert.equal(receivedMaxBytes, 5 * 1024 * 1024);
  assert.equal(reply.documents?.length, 1);
});
