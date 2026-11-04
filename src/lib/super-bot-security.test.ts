import assert from "node:assert/strict";
import test from "node:test";
import {
  SuperBotEventConflictError,
  createSuperBotEventStore,
  createSuperBotRateLimiter,
  fingerprintSuperBotEvent,
  getConfiguredSuperBotEventHashKey,
  getConfiguredSuperBotInternalApiKey,
  isSuperBotInternalRequestAuthorized,
} from "./super-bot-security";

test("the internal service key must be strong and is compared safely", () => {
  const key = "a".repeat(32);
  assert.equal(getConfiguredSuperBotInternalApiKey(""), null);
  assert.equal(getConfiguredSuperBotInternalApiKey("short"), null);
  assert.equal(getConfiguredSuperBotInternalApiKey(`abc\n${"a".repeat(32)}`), null);
  assert.equal(getConfiguredSuperBotInternalApiKey(key), key);
  assert.equal(getConfiguredSuperBotEventHashKey(key), key);
  assert.equal(getConfiguredSuperBotEventHashKey("short"), null);
  assert.equal(isSuperBotInternalRequestAuthorized(key, key), true);
  assert.equal(isSuperBotInternalRequestAuthorized(`${key}x`, key), false);
  assert.equal(isSuperBotInternalRequestAuthorized(null, key), false);
});

test("the in-process limiter bounds each client and the whole process", () => {
  const limiter = createSuperBotRateLimiter({ windowMs: 1_000, perClientLimit: 2, globalLimit: 3, maxClients: 2 });
  assert.equal(limiter.check("one", 0).allowed, true);
  assert.equal(limiter.check("one", 100).allowed, true);
  const clientLimit = limiter.check("one", 200);
  assert.deepEqual(clientLimit, { allowed: false, retryAfterSeconds: 1, scope: "client" });
  assert.equal(limiter.check("two", 300).allowed, true);
  const globalLimit = limiter.check("two", 400);
  assert.deepEqual(globalLimit, { allowed: false, retryAfterSeconds: 1, scope: "global" });
  assert.equal(limiter.check("one", 1_001).allowed, true);
});

test("duplicate provider events share a result, conflicts are rejected, and failed work can retry", async () => {
  let currentTime = 0;
  const store = createSuperBotEventStore({ now: () => currentTime, ttlMs: 1_000, pendingTtlMs: 100, maxEntries: 4 });
  let calls = 0;
  const fingerprint = fingerprintSuperBotEvent({ message: "producto" });

  const first = await store.execute("event-1", fingerprint, async () => ({ value: ++calls }));
  const replay = await store.execute("event-1", fingerprint, async () => ({ value: ++calls }));
  assert.deepEqual(first, { replayed: false, value: { value: 1 } });
  assert.deepEqual(replay, { replayed: true, value: { value: 1 } });
  assert.equal(calls, 1);

  await assert.rejects(
    store.execute("event-1", fingerprintSuperBotEvent({ message: "otro" }), async () => ({ value: ++calls })),
    SuperBotEventConflictError,
  );

  await assert.rejects(store.execute("event-failed", "same", async () => { throw new Error("temporary"); }));
  const retried = await store.execute("event-failed", "same", async () => ({ value: ++calls }));
  assert.deepEqual(retried, { replayed: false, value: { value: 2 } });

  currentTime = 1_001;
  const expired = await store.execute("event-1", fingerprint, async () => ({ value: ++calls }));
  assert.deepEqual(expired, { replayed: false, value: { value: 3 } });
});
