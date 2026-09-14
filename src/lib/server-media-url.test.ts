import assert from "node:assert/strict";
import test from "node:test";

import {
  getServerPublicBaseUrl,
  resolveServerMediaUrl,
} from "@/lib/server-media-url";

test("uses the explicit public app URL without corrupting it", () => {
  const environment = {
    NEXT_PUBLIC_APP_URL: "https://shop.example.test/",
    NODE_ENV: "test",
    VERCEL_PROJECT_PRODUCTION_URL: "ignored.vercel.app",
  } as NodeJS.ProcessEnv;

  assert.equal(
    getServerPublicBaseUrl(environment),
    "https://shop.example.test",
  );
  assert.equal(
    resolveServerMediaUrl("/uploads/item.jpg", environment),
    "https://shop.example.test/uploads/item.jpg",
  );
});

test("adds HTTPS to a bare Vercel production host", () => {
  assert.equal(
    getServerPublicBaseUrl({
      NODE_ENV: "test",
      VERCEL_PROJECT_PRODUCTION_URL: "shop.vercel.app",
    } as NodeJS.ProcessEnv),
    "https://shop.vercel.app",
  );
});

test("keeps an already absolute media URL", () => {
  assert.equal(
    resolveServerMediaUrl(
      "https://cdn.example.test/file.pdf",
      {} as NodeJS.ProcessEnv,
    ),
    "https://cdn.example.test/file.pdf",
  );
});

test("rejects non-HTTP media protocols", () => {
  assert.throws(() =>
    resolveServerMediaUrl(
      "file:///etc/passwd",
      {} as NodeJS.ProcessEnv,
    ),
  );
});
