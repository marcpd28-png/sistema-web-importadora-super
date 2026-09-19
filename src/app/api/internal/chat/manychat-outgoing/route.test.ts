import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("receiver requires authentication and explicit activation before accepting events", async t => {
  const names = ["N8N_INTERNAL_API_KEY", "MANYCHAT_OUTGOING_SYNC_ENABLED", "MANYCHAT_OUTGOING_SYNC_STARTED_AT"] as const;
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }));
  process.env.N8N_INTERNAL_API_KEY = "test-sync-key";
  delete process.env.MANYCHAT_OUTGOING_SYNC_ENABLED;
  delete process.env.MANYCHAT_OUTGOING_SYNC_STARTED_AT;
  const request = (key = "", body = "{}") => new Request("http://localhost/api/internal/chat/manychat-outgoing", {
    method: "POST", headers: { "x-internal-api-key": key, "Content-Type": "application/json" }, body,
  });
  assert.equal((await POST(request())).status, 401);
  assert.equal((await POST(request("test-sync-key"))).status, 503);
  process.env.MANYCHAT_OUTGOING_SYNC_ENABLED = "true";
  assert.equal((await POST(request("test-sync-key"))).status, 503);
  process.env.MANYCHAT_OUTGOING_SYNC_STARTED_AT = "2026-09-19T00:00:00Z";
  assert.equal((await POST(request("test-sync-key", "not-json"))).status, 400);
});
