import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouterV2MessageBatch,
  type RouterV2BatchMessage,
} from "@/lib/router-v2-message-batch";

function message(
  id: string,
  seconds: number,
  content: string,
  overrides: Partial<RouterV2BatchMessage> = {},
): RouterV2BatchMessage {
  return {
    id,
    direction: "INBOUND",
    senderType: "CUSTOMER",
    messageType: "TEXT",
    content,
    mediaUrl: null,
    createdAt: new Date(1_700_000_000_000 + seconds * 1000),
    ...overrides,
  };
}

test("older fragmented execution is superseded by the latest inbound message", () => {
  const result = buildRouterV2MessageBatch({
    messages: [
      message("m1", 0, "Hola"),
      message("m2", 1, "quiero un JBL"),
      message("m3", 2, "Flip 7 azul"),
    ],
    triggerMessageId: "m2",
  });

  assert.equal(result.status, "SUPERSEDED");
  if (result.status === "SUPERSEDED") {
    assert.equal(result.latestMessageId, "m3");
  }
});

test("latest execution combines nearby customer fragments", () => {
  const result = buildRouterV2MessageBatch({
    messages: [
      message("m1", 0, "Quiero comprar"),
      message("m2", 1, "JBL Flip 7"),
      message("m3", 2, "azul"),
    ],
    triggerMessageId: "m3",
  });

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.equal(result.content, "Quiero comprar\nJBL Flip 7\nazul");
    assert.deepEqual(result.messageIds, ["m1", "m2", "m3"]);
  }
});

test("batch never crosses a bot or agent response boundary", () => {
  const result = buildRouterV2MessageBatch({
    messages: [
      message("m1", 0, "mensaje antiguo"),
      message("b1", 1, "respuesta", {
        direction: "OUTBOUND",
        senderType: "BOT",
      }),
      message("m2", 2, "quiero cuatro"),
      message("m3", 3, "en azul"),
    ],
    triggerMessageId: "m3",
  });

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.equal(result.content, "quiero cuatro\nen azul");
    assert.deepEqual(result.messageIds, ["m2", "m3"]);
  }
});

test("batch keeps media references while combining text", () => {
  const result = buildRouterV2MessageBatch({
    messages: [
      message("m1", 0, "", {
        messageType: "IMAGE",
        mediaUrl: "https://example.test/product.jpg",
      }),
      message("m2", 1, "cuanto cuesta este"),
    ],
    triggerMessageId: "m2",
  });

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.equal(result.content, "cuanto cuesta este");
    assert.equal(result.media.length, 1);
    assert.equal(result.media[0].messageId, "m1");
  }
});
