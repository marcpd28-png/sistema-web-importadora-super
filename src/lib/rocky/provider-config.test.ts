import assert from "node:assert/strict";
import test from "node:test";
import { localOllamaUrl, rockyChatTimeoutMs, rockyKeepAlive } from "./provider";

test("configuración de Ollama mantiene límites seguros", () => {
  assert.equal(localOllamaUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434");
  assert.equal(rockyChatTimeoutMs(undefined), 60_000);
  assert.equal(rockyChatTimeoutMs("45000"), 45_000);
  assert.equal(rockyChatTimeoutMs("9000"), 60_000);
  assert.equal(rockyChatTimeoutMs("120001"), 60_000);
  assert.equal(rockyKeepAlive(undefined), "30s");
  assert.equal(rockyKeepAlive("2m"), "2m");
  assert.equal(rockyKeepAlive("forever"), "30s");
});

test("Ollama permanece limitado al host local", () => {
  assert.throws(() => localOllamaUrl("https://example.com"), /OLLAMA_MUST_BE_LOCALHOST/);
  assert.throws(() => localOllamaUrl("http://127.0.0.1:11434/api"), /OLLAMA_MUST_BE_LOCALHOST/);
});
