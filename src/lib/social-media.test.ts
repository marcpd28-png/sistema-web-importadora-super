import test from "node:test";
import assert from "node:assert/strict";
import { uploadSocialFile } from "./social-media";

test("PDF upload uses provider storage and registers bytes without sending a message or exposing storage credentials", async () => {
  const fetchBefore = global.fetch;
  const tokenBefore = process.env.SOCIAL_INBOX_API_TOKEN;
  process.env.SOCIAL_INBOX_API_TOKEN = "private-token";
  const calls: string[] = [];
  try {
    global.fetch = async (input, init) => {
      const url = String(input); calls.push(url);
      if (url.endsWith("upload-url")) return Response.json({ path: "workspace/file.pdf", uploadUrl: "https://storage.example/upload?secret=private" });
      if (url.startsWith("https://storage.example/")) {
        assert.equal(init?.method, "PUT");
        assert.equal((init?.headers as Record<string, string>).Authorization, undefined);
        assert.equal(new TextDecoder().decode(init?.body as Uint8Array), "%PDF-1.4 test");
        return new Response(null, { status: 200 });
      }
      assert.equal(JSON.parse(init?.body as string).path, "workspace/file.pdf");
      return Response.json({ id: "12345", url: "https://storage.example/file?secret=private" });
    };
    assert.deepEqual(await uploadSocialFile(new File(["%PDF-1.4 test"], "catalogo.pdf", { type: "application/pdf" })), { mediaFileId: "12345", name: "catalogo.pdf" });
    assert.equal(calls.length, 3);
    assert.equal(calls.some(url => url.includes("/messages")), false);
    const count = calls.length;
    await assert.rejects(uploadSocialFile(new File(["alert(1)"], "script.html", { type: "text/html" })));
    await assert.rejects(uploadSocialFile(new File([], "empty.pdf", { type: "application/pdf" })));
    await assert.rejects(uploadSocialFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })));
    assert.equal(calls.length, count);
  } finally {
    global.fetch = fetchBefore;
    if (tokenBefore === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN; else process.env.SOCIAL_INBOX_API_TOKEN = tokenBefore;
  }
});
