import assert from "node:assert/strict";
import { test } from "node:test";
import { getClarityProjectId, isTrackedStorePath, prepareClarity, trackClarityEvent } from "./clarity";
import { trackSearch, trackAddToCart } from "./analytics";

test("invalid project IDs cannot inject URLs or script content", () => {
  for (const id of [undefined, "", "a/b", 'x\" onload=alert(1)', "https://example.com"]) {
    assert.equal(getClarityProjectId(id), "");
  }
  assert.equal(getClarityProjectId(" abc123 "), "abc123");
});

test("only public catalog routes are tracked", () => {
  for (const path of ["/", "/producto/altavoz", "/categoria/audio/", "/p/ficha"]) {
    assert.equal(isTrackedStorePath(path), true, path);
  }
  for (const path of ["/admin", "/admin/orders", "/cuenta", "/cuenta/cotizaciones/123", "/login", "/acceso", "/libro-reclamaciones", "/api/checkout", "/producto/foo/private"]) {
    assert.equal(isTrackedStorePath(path), false, path);
  }
});

test("events respect active tracking, exclude private routes and omit personal payloads", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fake = { location: { pathname: "/" }, storeAnalyticsActive: false } as unknown as Window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake });
  try {
    prepareClarity();
    const queue = fake.clarity;
    prepareClarity();
    assert.equal(fake.clarity, queue);
    trackClarityEvent("search");
    assert.deepEqual(queue!.q, []);
    fake.storeAnalyticsActive = true;
    trackSearch("cliente@example.com");
    trackAddToCart({ item_id: "123", item_name: "Producto", price: 10, quantity: 1 });
    assert.deepEqual(queue!.q, [["event", "search"], ["event", "add_to_cart"]]);
    fake.location.pathname = "/cuenta";
    trackClarityEvent("search");
    assert.equal(queue!.q!.length, 2);
    fake.location.pathname = "/";
    fake.clarity = () => { throw new Error("blocked tracker"); };
    assert.doesNotThrow(() => trackAddToCart({ item_id: "123", item_name: "Producto", price: 10, quantity: 1 }));
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
