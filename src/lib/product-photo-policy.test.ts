import assert from "node:assert/strict";
import test from "node:test";
import { getPreferredProductImageUrl, hasRealProductPhoto, type ProductMediaSource } from "@/lib/product-media";
import { preserveProductCoverInGallery } from "@/lib/product-editor-media";

const cases: Array<[string, ProductMediaSource, string | null]> = [
  ["sin campos", {}, null],
  ["campos nulos", { imageUrl: null, localImageUrl: null, media: [] }, null],
  ["campos vacíos", { imageUrl: "", localImageUrl: "" }, null],
  ["solo espacios", { imageUrl: " \t\n", localImageUrl: " " }, null],
  ["portada genérica ERP", { imageUrl: "https://original.negocioserp.com/logo/imagen-no-disponible.jpg?v=2" }, null],
  ["imagen genérica local", { localImageUrl: "/uploads/NO-IMAGE.webp" }, null],
  ["galería genérica", { media: [{ type: "IMAGE", url: "https://example.com/PLACEHOLDER.jpg" }] }, null],
  ["solo video", { media: [{ type: "VIDEO", url: "https://example.com/video.mp4" }] }, null],
  ["portada real sin copia local", { imageUrl: "https://example.com/photo.jpg", localImageUrl: null }, "https://example.com/photo.jpg"],
  ["copia local sin portada", { imageUrl: null, localImageUrl: "/uploads/photo.webp" }, "/uploads/photo.webp"],
  ["foto en galería", { media: [{ type: "IMAGE", url: "/uploads/photo.webp" }] }, "/uploads/photo.webp"],
  ["video antes de foto", { media: [{ type: "VIDEO", url: "/video.mp4" }, { type: "IMAGE", url: "/photo.webp" }] }, "/photo.webp"],
  ["genérica local con portada real", { localImageUrl: "/sin-foto.png", imageUrl: "/photo.webp" }, "/photo.webp"],
];

for (const [name, product, expected] of cases) {
  test(`foto pública: ${name}`, () => {
    assert.equal(getPreferredProductImageUrl(product), expected);
    assert.equal(hasRealProductPhoto(product), expected !== null);
  });
}

test("una portada guardada sigue disponible cuando la sincronización borra los campos ERP", () => {
  const media = preserveProductCoverInGallery("/uploads/manual.webp", []);
  const resynced = { imageUrl: null, localImageUrl: null, media };
  assert.equal(getPreferredProductImageUrl(resynced), "/uploads/manual.webp");
  assert.deepEqual(preserveProductCoverInGallery("/uploads/manual.webp", media), media);
});

test("guardar una portada genérica no añade una foto válida a la galería", () => {
  const media = preserveProductCoverInGallery("/uploads/placeholder.webp", []);
  assert.deepEqual(media, []);
  assert.equal(hasRealProductPhoto({ media }), false);
});

test("al cambiar la portada se conserva la galería y se prioriza la nueva foto sin duplicarla", () => {
  const media = preserveProductCoverInGallery("/new.webp", [
    { type: "IMAGE", url: "/old.webp", sortOrder: 0 },
    { type: "IMAGE", url: "/new.webp", sortOrder: 1 },
    { type: "VIDEO", url: "/video.mp4", sortOrder: 2 },
  ]);
  assert.deepEqual(media.map((item) => item.url), ["/new.webp", "/old.webp", "/video.mp4"]);
  assert.equal(getPreferredProductImageUrl({ media }), "/new.webp");
});
