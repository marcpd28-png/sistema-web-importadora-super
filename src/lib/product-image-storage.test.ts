import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSourceImageFingerprint,
  isPotentialRemoteImageContentType,
} from "@/lib/product-image-storage";

test("la huella de imagen cambia aunque la URL permanezca igual", () => {
  const url = "https://erp.example.com/products/photo.jpg";
  const first = buildSourceImageFingerprint(url, {
    contentLength: "1200",
    etag: '"version-1"',
    lastModified: "Mon, 06 Jul 2026 10:00:00 GMT",
  });
  const second = buildSourceImageFingerprint(url, {
    contentLength: "1300",
    etag: '"version-2"',
    lastModified: "Mon, 06 Jul 2026 10:05:00 GMT",
  });

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
});

test("la huella es estable para los mismos validadores HTTP", () => {
  const input = {
    contentLength: "1200",
    etag: '"version-1"',
    lastModified: "Mon, 06 Jul 2026 10:00:00 GMT",
  };

  assert.equal(
    buildSourceImageFingerprint("https://erp.example.com/photo.jpg", input),
    buildSourceImageFingerprint("https://erp.example.com/photo.jpg", input),
  );
});

test("sin ETag ni Last-Modified se fuerza validación por contenido", () => {
  assert.equal(
    buildSourceImageFingerprint("https://erp.example.com/photo.jpg", {
      contentLength: "1200",
    }),
    null,
  );
});

test("acepta octet-stream como posible imagen remota porque Sharp valida el contenido", () => {
  assert.equal(isPotentialRemoteImageContentType("image/jpeg"), true);
  assert.equal(isPotentialRemoteImageContentType("application/octet-stream"), true);
  assert.equal(isPotentialRemoteImageContentType("application/octet-stream; charset=binary"), true);
  assert.equal(isPotentialRemoteImageContentType("text/html"), false);
});
