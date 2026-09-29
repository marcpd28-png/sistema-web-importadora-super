import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("los envíos automáticos reservan una clave persistente antes de llegar a YCloud", () => {
  assert.match(route, /outboundMessageDispatch/);
  assert.match(route, /recipient_fingerprint/);
  assert.match(route, /DuplicateOutboundMessageError/);
  assert.match(route, /return deliverYCloudOutboundMessage\(input\)/);
});
