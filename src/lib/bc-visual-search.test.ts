import assert from "node:assert/strict";
import test from "node:test";
import { describeBcPhoto, loadBcPhoto } from "./bc-visual-search";
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";

test("visual parser accepts descriptions only and fails closed on malformed/provider errors", async () => {
  const before = { enabled: process.env.BC_VISUAL_SEARCH_ENABLED, key: process.env.GEMINI_API_KEY };
  process.env.BC_VISUAL_SEARCH_ENABLED = "true"; process.env.GEMINI_API_KEY = "test";
  try {
    const reply = { recognizable: true, query: "parlante", description: "un parlante negro" };
    const valid: typeof fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert(request.contents[0].parts[0].inlineData.data); assert.equal(request.generationConfig.temperature, 0);
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] });
    };
    assert.deepEqual(await describeBcPhoto(photo, valid), reply);
    assert.equal(await describeBcPhoto(photo, async () => Response.json({ error: "quota" }, { status: 429 })), null);
    assert.equal(await describeBcPhoto(photo, async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"query": "inventado"}' }] } }] })), null);
    assert.equal(await describeBcPhoto("https://127.0.0.1/private", valid), null);
  } finally {
    if (before.enabled === undefined) delete process.env.BC_VISUAL_SEARCH_ENABLED; else process.env.BC_VISUAL_SEARCH_ENABLED = before.enabled;
    if (before.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = before.key;
  }
});

test("attachment reader rejects arbitrary URLs, credentials, disguised hosts and non-images", async () => {
  for (const mediaUrl of ["http://127.0.0.1/internal", "https://example.com/photo", "https://fbcdn.net.evil.test/photo", "https://user:pass@fbcdn.net/photo", "file:///etc/passwd"]) assert.equal(await loadBcPhoto({ messageType: "IMAGE", mediaUrl }), null);
  assert.equal(await loadBcPhoto({ messageType: "DOCUMENT", mediaUrl: photo }), null);
});
