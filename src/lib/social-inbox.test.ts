import test from "node:test";
import assert from "node:assert/strict";
import { channelInbox, dedupeSocialMessages, socialConnectionStatus, messengerMetaResumeMinutes, parseSocialChannel, safeSocialMessage, socialConversation, socialRequest, sendSocialReply, type SocialConversation, type SocialMessage } from "./social-inbox";

test("Manual Messenger replies default to a safe, bounded Meta reactivation delay", () => {
  const original = process.env.MESSENGER_META_AI_RESUME_MINUTES;
  try {
    delete process.env.MESSENGER_META_AI_RESUME_MINUTES;
    assert.equal(messengerMetaResumeMinutes(), 15);
    process.env.MESSENGER_META_AI_RESUME_MINUTES = "30";
    assert.equal(messengerMetaResumeMinutes(), 30);
    process.env.MESSENGER_META_AI_RESUME_MINUTES = "0";
    assert.equal(messengerMetaResumeMinutes(), 15);
    process.env.MESSENGER_META_AI_RESUME_MINUTES = "10081";
    assert.equal(messengerMetaResumeMinutes(), 15);
  } finally {
    if (original === undefined) delete process.env.MESSENGER_META_AI_RESUME_MINUTES;
    else process.env.MESSENGER_META_AI_RESUME_MINUTES = original;
  }
});

test("Social channels fail closed and cannot fall through to WhatsApp or Telegram", () => {
  assert.equal(parseSocialChannel("messenger"), "messenger");
  for (const value of ["telegram", "whatsapp", "../integrations", ""]) assert.throws(() => parseSocialChannel(value));
  const conversation = { contactInboxes: [{ id: "1", channel: "messenger" }, { id: "2", channel: "telegram" }] } as SocialConversation;
  assert.equal(channelInbox(conversation, "messenger").id, "1");
  assert.throws(() => channelInbox(conversation, "tiktok"));
  conversation.contactInboxes.push(conversation.contactInboxes[0]);
  assert.throws(() => channelInbox(conversation, "messenger"));
});

test("Sending enforces channel and Messenger window before mutation, pauses bot first, and selects the exact inbox", async () => {
  const original = global.fetch;
  const originalToken = process.env.SOCIAL_INBOX_API_TOKEN;
  process.env.SOCIAL_INBOX_API_TOKEN = "test-secret";
  const calls: { url: string; body?: string }[] = [];
  let lastIncoming = new Date(Date.now() - 86400001).toISOString();
  let failHandoff = false;
  try {
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), body: options?.body as string | undefined });
      if (String(url).endsWith("/disable-bot")) return Response.json({ success: !failHandoff }, { status: failHandoff ? 500 : 200 });
      if (String(url).endsWith("/messages")) return Response.json({ id: "message", text: "reply", attachments: [] });
      return Response.json({ data: { id: "123", contactInboxes: [{ id: "1", inboxId: "456", channel: "messenger", lastIncomingMessageAt: lastIncoming }] } });
    };
    await assert.rejects(sendSocialReply("messenger", "123", "reply", "request"), /24 horas/);
    assert.equal(calls.length, 1);
    lastIncoming = "invalid";
    await assert.rejects(sendSocialReply("messenger", "123", "reply", "request"), /24 horas/);
    assert.equal(calls.length, 2);
    await assert.rejects(sendSocialReply("tiktok", "123", "reply", "request"));
    assert.equal(calls.length, 3);
    lastIncoming = new Date().toISOString();
    failHandoff = true;
    await assert.rejects(sendSocialReply("messenger", "123", "reply", "request"));
    assert.equal(calls.length, 5);
    assert.equal(calls.some(c => c.url.endsWith("/messages")), false);
    failHandoff = false;
    const result = await sendSocialReply("messenger", "123", "reply", "request-2");
    assert.equal(result.id, "message");
    assert.ok(calls.at(-2)?.url.endsWith("/disable-bot"));
    assert.deepEqual(JSON.parse(calls.at(-1)!.body!), { text: "reply", inboxId: "456" });
    await sendSocialReply("messenger", "123", "", "request-file", "789");
    assert.deepEqual(JSON.parse(calls.at(-1)!.body!), { inboxId: "456", mediaFileId: "789" });
    const beforeInvalid = calls.length;
    await assert.rejects(sendSocialReply("tiktok", "123", "", "request-file", "789"));
    await assert.rejects(sendSocialReply("messenger", "123", "", "request-file", "../789"));
    assert.equal(calls.length, beforeInvalid);
  } finally { global.fetch = original; if (originalToken === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN; else process.env.SOCIAL_INBOX_API_TOKEN = originalToken; }
});

test("Provider response cannot leak secrets, deleted contents, or executable attachment links", () => {
  const message = { id: "1", text: "deleted", deletedAt: "today", sendError: "token=secret", attachments: [{ id: "a", name: "file", url: "javascript:alert(1)" }] } as SocialMessage;
  const safe = safeSocialMessage(message);
  assert.equal(safe.text, null); assert.deepEqual(safe.attachments, []);
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.equal(safeSocialMessage({ ...message, deletedAt: null }).attachments?.[0].url, null);
  const routing = safeSocialMessage({ ...message, sendError: "(#10 - 2018300) token=secret" });
  assert.match(routing.sendError!, /otra app controla/);
  assert.equal(JSON.stringify(routing).includes("secret"), false);
});

test("A provider echo or repeated request cannot create two visible social replies", async () => {
  const original = global.fetch;
  const originalToken = process.env.SOCIAL_INBOX_API_TOKEN;
  process.env.SOCIAL_INBOX_API_TOKEN = "test-secret";
  let sendCount = 0;
  try {
    global.fetch = async (url) => {
      if (String(url).endsWith("/disable-bot")) return Response.json({ success: true });
      if (String(url).endsWith("/messages")) {
        sendCount++;
        return Response.json({ id: "same-message", text: "respuesta única", attachments: [] });
      }
      return Response.json({ data: { id: "987", contactInboxes: [{ id: "1", inboxId: "456", channel: "messenger", lastIncomingMessageAt: new Date().toISOString() }] } });
    };
    const [first, second] = await Promise.all([
      sendSocialReply("messenger", "987", "respuesta única", "4becff14-7b1a-499a-bfcf-0f009c001337"),
      sendSocialReply("messenger", "987", "respuesta única", "2b2c1177-fc85-4a43-b0c9-b68538a8c34b"),
    ]);
    assert.equal(first.id, "same-message");
    assert.equal(second.id, "same-message");
    assert.equal(sendCount, 1);

    const messages = dedupeSocialMessages([
      { id: "api-row", sourceId: "provider-message", senderType: "api", createdAt: "2026-10-10T20:55:39.749Z" },
      { id: "echo-row", sourceId: "provider-message", senderType: "user", createdAt: "2026-10-10T20:55:41Z" },
    ] as SocialMessage[]);
    assert.deepEqual(messages.map(message => message.id), ["echo-row"]);
  } finally {
    global.fetch = original;
    if (originalToken === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN;
    else process.env.SOCIAL_INBOX_API_TOKEN = originalToken;
  }
});

test("Meta handover notices stay out of reply bubbles and are localized by the inbox", () => {
  const safe = safeSocialMessage({
    id: "handover", text: "You took over this chat from your AI agent.", createdAt: "2026-10-10T20:00:00Z",
    contactInboxId: "1", messageType: "outgoing", deletedAt: null, sendError: null,
  });
  assert.equal(safe.text, null);
  assert.equal(safe.systemEvent, "meta_ai_handover");
});

test("Chatbot adapter uses documented data envelope, private auth and idempotency without retrying failures", async () => {
  const original = global.fetch;
  const originalToken = process.env.SOCIAL_INBOX_API_TOKEN;
  process.env.SOCIAL_INBOX_API_TOKEN = "test-secret";
  let calls = 0;
  try {
    global.fetch = async (_url, options) => {
      calls++;
      assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-secret");
      return Response.json({ data: { id: "123", contactInboxes: [{ id: "1", channel: "messenger" }] } });
    };
    assert.equal((await socialConversation("123", "messenger")).inbox.id, "1");
    await assert.rejects(socialConversation("../123", "messenger"));
    assert.equal(calls, 1);
    global.fetch = async (_url, options) => {
      calls++;
      assert.equal((options?.headers as Record<string, string>)["Idempotency-Key"], "request-1");
      return Response.json({ message: "private secret" }, { status: 403 });
    };
    await assert.rejects(socialRequest("/conversations/123/messages", { text: "hello" }, "request-1"), error => error instanceof Error && !error.message.includes("secret"));
    assert.equal(calls, 2);
  } finally { global.fetch = original; if (originalToken === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN; else process.env.SOCIAL_INBOX_API_TOKEN = originalToken; }
});


test("Connection status uses channel inboxes across pages and distinguishes disconnected accounts", async () => {
  const original = global.fetch;
  const token = process.env.SOCIAL_INBOX_API_TOKEN;
  process.env.SOCIAL_INBOX_API_TOKEN = "test";
  const urls: string[] = [];
  try {
    global.fetch = async (url) => {
      urls.push(String(url));
      assert.ok(String(url).includes("/inboxes?"));
      return Response.json({ pageCount: 2, data: urls.length === 1
        ? [{ channel: "telegram", status: "connected" }, { channel: "messenger", status: "connected" }]
        : [{ channel: "messenger", status: "disconnected" }, { channel: "tiktok", status: "connected" }] });
    };
    assert.deepEqual(await socialConnectionStatus("messenger"), { authorizedAccounts: 2, connectedAccounts: 1 });
    assert.ok(urls[1].includes("page=2"));
  } finally { global.fetch = original; if (token === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN; else process.env.SOCIAL_INBOX_API_TOKEN = token; }
});
