import assert from "node:assert/strict";
import test from "node:test";
import { mergeChatMessages, type MergeableChatMessage } from "./message-client-dedupe";

type TestMessage = MergeableChatMessage & { content: string };

test("a persisted outgoing message replaces its optimistic bubble by request id", () => {
  const requestId = "3bd5b7d8-1a79-48d2-a118-0dda6c243a73";
  const optimistic: TestMessage = {
    id: "m-new-1762210915000",
    content: "si es compatible",
    createdAt: "2026-11-03T17:41:55.000Z",
    externalMessageId: null,
    metadata: { requestId },
    status: "sending",
  };
  const persisted: TestMessage = {
    ...optimistic,
    id: "waout:3bd5b7d8-1a79-48d2-a118-0dda6c243a73",
    externalMessageId: "wamid.confirmed",
    status: "accepted",
  };

  const merged = mergeChatMessages([optimistic], [persisted]);
  assert.deepEqual(merged.map((message) => message.id), [persisted.id]);
});

test("same-text messages without a shared request id remain visible", () => {
  const first: TestMessage = {
    id: "first",
    content: "si es compatible",
    createdAt: "2026-11-03T17:41:55.000Z",
    externalMessageId: null,
    metadata: null,
    status: "delivered",
  };
  const second: TestMessage = { ...first, id: "second", createdAt: "2026-11-03T17:41:57.000Z" };

  assert.deepEqual(mergeChatMessages([first], [second]).map((message) => message.id), ["first", "second"]);
});
