import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("el webhook solo produce trabajos; no accede al transporte automático", () => {
  assert.doesNotMatch(route, /sendYCloudOutboundMessage|api\.ycloud\.com/);
  assert.match(route, /rockyOutbox\.enqueue/);
  assert.match(route, /rockyOutbox\.runTurn/);
  assert.match(route, /rockyOutbox\.assertCurrent/);
  assert.match(route, /rockyOutbox\.handoff/);
});
