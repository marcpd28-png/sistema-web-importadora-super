import assert from "node:assert/strict";
import test from "node:test";
import { runMessageWorkerCycle } from "./message-worker-cycle";

test("a BC outage cannot starve receipts or outgoing images", async () => {
  const done: string[] = [], failed: string[] = [];
  await runMessageWorkerCycle([
    { name: "bc", run: async () => { throw new Error("unavailable"); } },
    { name: "receipts", run: async () => { done.push("receipts"); } },
    { name: "images", run: async () => { done.push("images"); } },
  ], name => failed.push(name));
  assert.deepEqual(done, ["receipts", "images"]);
  assert.deepEqual(failed, ["bc"]);
});
