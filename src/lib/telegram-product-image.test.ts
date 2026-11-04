import assert from "node:assert/strict";
import test from "node:test";

import {
  getTelegramProductImageUrl,
  getVerifiedLocalProductImageFileName,
  getVerifiedLocalProductImageFileNameFromProduct,
  normalizeTelegramProductImageCode,
} from "./telegram-product-image";

test("builds a Telegram derivative URL only for a safe code and real local product image", () => {
  assert.equal(
    getTelegramProductImageUrl("O864", {
      localImageUrl: "/uploads/products/erp-o864-abc123.webp",
    }),
    "/api/telegram/product-image/O864",
  );
  assert.equal(
    getTelegramProductImageUrl("O864", {
      localImageUrl: "https://original.negocioserp.com/storage/uploads/items/o864.jpg",
    }),
    null,
  );
  assert.equal(
    getTelegramProductImageUrl("O864", {
      localImageUrl: "/uploads/products/no-image.webp",
    }),
    null,
  );
  assert.equal(
    getTelegramProductImageUrl("O864/../../etc", {
      localImageUrl: "/uploads/products/erp-o864-abc123.webp",
    }),
    null,
  );
});

test("accepts a verified local gallery photo but rejects traversal and non-image files", () => {
  assert.equal(
    getVerifiedLocalProductImageFileNameFromProduct({
      media: [
        { type: "VIDEO", url: "/uploads/products/video.mp4" },
        { type: "IMAGE", url: "/uploads/products/erp-o864-abc123.webp" },
      ],
    }),
    "erp-o864-abc123.webp",
  );
  assert.equal(getVerifiedLocalProductImageFileName("/uploads/products/../secret.webp"), null);
  assert.equal(getVerifiedLocalProductImageFileName("/uploads/products/%2e%2e/secret.webp"), null);
  assert.equal(getVerifiedLocalProductImageFileName("/uploads/products/erp-o864.pdf"), null);
  assert.equal(normalizeTelegramProductImageCode("O864"), "O864");
  assert.equal(normalizeTelegramProductImageCode("O864?redirect=1"), null);
});
