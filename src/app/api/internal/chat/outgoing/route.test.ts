import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("retired outgoing recorder cannot recreate BOT messages", async () => {
  assert.equal((await POST()).status, 410);
});
