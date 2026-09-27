import test from "node:test";
import assert from "node:assert/strict";
import { groupRockyReviewTurns } from "./recent-review";

const at = (second: number) => new Date(`2026-09-26T20:00:${String(second).padStart(2, "0")}.000Z`);
const message = (id: string, content: string, direction: "INBOUND" | "OUTBOUND", second: number, messageType: "TEXT" | "IMAGE" = "TEXT") => ({
  id, content, direction, messageType, createdAt: at(second),
  senderType: direction === "INBOUND" ? "CUSTOMER" as const : "AGENT" as const,
});

test("starts another turn after Rocky's five-second quiet period even without a recorded outbound message", () => {
  const turns = groupRockyReviewTurns([
    message("one", "camara", "INBOUND", 1),
    message("two", "espia", "INBOUND", 4),
    message("three", "precio", "INBOUND", 11),
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].customerText, "camara\nespia");
  assert.equal(turns[1].customerText, "precio");
});

test("groups separated customer fragments before the recorded reply", () => {
  const turns = groupRockyReviewTurns([
    message("one", "busco cargador", "INBOUND", 1),
    message("two", "samsung", "INBOUND", 2),
    message("three", "de 25w", "INBOUND", 3),
    message("reply", "Sí tenemos", "OUTBOUND", 4),
    message("four", "precio", "INBOUND", 5),
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].customerText, "busco cargador\nsamsung\nde 25w");
  assert.equal(turns[0].actualReply, "Sí tenemos");
  assert.deepEqual(turns[0].sourceMessageIds, ["one", "two", "three"]);
  assert.equal(turns[1].customerText, "precio");
});

test("marks media turns as visible but not replayable without the original file", () => {
  const [turn] = groupRockyReviewTurns([message("photo", "qué precio tiene", "INBOUND", 1, "IMAGE")]);
  assert.equal(turn.canReplay, false);
  assert.equal(turn.customerText, "[Imagen] qué precio tiene");
  assert.deepEqual(turn.mediaTypes, ["IMAGE"]);
});
