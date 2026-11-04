import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { createTelegramProductImageHandler } from "./telegram-product-image-route";

function context(code: string) {
  return { params: Promise.resolve({ code }) };
}

test("serves a JPEG derivative only for a visible product's verified local image", async () => {
  const imageRoot = await mkdtemp(path.join(tmpdir(), "telegram-product-image-"));

  try {
    const fileName = "erp-o864-abc123.webp";
    const source = await sharp({
      create: {
        width: 48,
        height: 32,
        channels: 4,
        background: "#1e40af",
      },
    }).webp().toBuffer();
    await writeFile(path.join(imageRoot, fileName), source);

    const handler = createTelegramProductImageHandler({
      productImageRoot: imageRoot,
      findVisibleProductByCode: async (code) => code === "O864"
        ? { localImageUrl: `/uploads/products/${fileName}` }
        : null,
    });

    const response = await handler(
      new Request("https://tiendavirtualsuper.com/api/telegram/product-image/O864"),
      context("O864"),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.match(response.headers.get("cache-control") ?? "", /public/);
    const jpeg = Buffer.from(await response.arrayBuffer());
    assert.equal((await sharp(jpeg).metadata()).format, "jpeg");
    assert.equal(response.headers.get("content-length"), String(jpeg.length));

    const cached = await handler(
      new Request("https://tiendavirtualsuper.com/api/telegram/product-image/O864", {
        headers: { "if-none-match": response.headers.get("etag") ?? "" },
      }),
      context("O864"),
    );
    assert.equal(cached.status, 304);
  } finally {
    await rm(imageRoot, { force: true, recursive: true });
  }
});

test("does not resolve paths outside a product's local image directory", async () => {
  let statCalls = 0;
  const handler = createTelegramProductImageHandler({
    productImageRoot: "/tmp/product-images",
    findVisibleProductByCode: async () => ({
      localImageUrl: "/uploads/products/../not-a-product.webp",
    }),
    stat: async () => {
      statCalls += 1;
      return { isFile: () => true, mtimeMs: 1, size: 1 };
    },
  });

  const response = await handler(
    new Request("https://tiendavirtualsuper.com/api/telegram/product-image/O864"),
    context("O864"),
  );

  assert.equal(response.status, 404);
  assert.equal(statCalls, 0);
});
