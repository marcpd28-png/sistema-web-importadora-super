import test from "node:test";
import assert from "node:assert/strict";
import { channelInbox, dedupeSocialMessages, enableSocialBot, socialConnectionStatus, parseSocialChannel, safeSocialMessage, socialConversation, socialConversationDisplayName, socialRequest, sendSocialReply, type SocialConversation, type SocialMessage } from "./social-inbox";

test("Social channels fail closed and cannot fall through to another transport", () => {
  assert.equal(parseSocialChannel("messenger"), "messenger");
  for (const value of ["telegram", "legacy-channel", "../integrations", ""]) assert.throws(() => parseSocialChannel(value));
  const conversation = { contactInboxes: [{ id: "1", channel: "messenger" }, { id: "2", channel: "telegram" }] } as SocialConversation;
  assert.equal(channelInbox(conversation, "messenger").id, "1");
  assert.throws(() => channelInbox(conversation, "tiktok"));
  conversation.contactInboxes.push(conversation.contactInboxes[0]);
  assert.throws(() => channelInbox(conversation, "messenger"));
});

test("Conversation labels use the provider name fields before a generic fallback", () => {
  const inboxes = [
    { id: "tiktok-contact", inboxId: "tiktok", channel: "tiktok", lastIncomingMessageAt: null, sourceUsername: "perfil-tiktok", inbox: { name: "TikTok" } },
    { id: "messenger-contact", inboxId: "messenger", channel: "messenger", lastIncomingMessageAt: null, sourceUsername: "perfil-messenger", inbox: { name: "Messenger" } },
  ];

  assert.equal(socialConversationDisplayName({ id: "conversation-1", botEnabled: true, contact: { fullName: "  Ana   Pérez " }, contactInboxes: inboxes }, "messenger"), "Ana Pérez");
  assert.equal(socialConversationDisplayName({ id: "conversation-2", botEnabled: true, contact: { fullName: "Cliente", firstName: " Ana ", lastName: "Pérez" }, contactInboxes: inboxes }, "messenger"), "Ana Pérez");
  assert.equal(socialConversationDisplayName({ id: "conversation-3", botEnabled: true, contact: null, contactInboxes: inboxes }, "messenger"), "@perfil-messenger");
  assert.equal(socialConversationDisplayName({ id: "conversation-123456", botEnabled: true, contact: { id: "contact-654321" }, contactInboxes: [] }, "messenger"), "Cliente sin nombre · 123456");
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
      if (String(url).includes("/media-library/files/")) return Response.json({ id: "789", path: "workspace/foto.jpg", url: "https://cdn.example.test/foto.jpg", mimeType: "image/jpeg", name: "foto.jpg", size: 1234 });
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
    assert.deepEqual(JSON.parse(calls.at(-1)!.body!), {
      inboxId: "456",
      mediaFile: { path: "workspace/foto.jpg", url: "https://cdn.example.test/foto.jpg", mimeType: "image/jpeg", name: "foto.jpg", size: 1234 },
    });
    assert.ok(calls.some(call => call.url.includes("/media-library/files/789")));
    const beforeInvalid = calls.length;
    await assert.rejects(sendSocialReply("tiktok", "123", "", "request-file", "789"));
    await assert.rejects(sendSocialReply("messenger", "123", "", "request-file", "../789"));
    assert.equal(calls.length, beforeInvalid);
  } finally {
    global.fetch = original;
    if (originalToken === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN; else process.env.SOCIAL_INBOX_API_TOKEN = originalToken;
  }
});

test("An incomplete uploaded media record never pauses the bot", async () => {
  const original = global.fetch;
  const originalToken = process.env.SOCIAL_INBOX_API_TOKEN;
  process.env.SOCIAL_INBOX_API_TOKEN = "test-secret";
  const calls: string[] = [];
  try {
    global.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("/media-library/files/")) {
        return Response.json({ id: "790", path: "workspace/incomplete.jpg", url: "", mimeType: "image/jpeg", name: "incomplete.jpg", size: 123 });
      }
      throw new Error("The conversation must not be changed for an incomplete file.");
    };
    await assert.rejects(sendSocialReply("messenger", "123", "", "incomplete-file", "790"), /no está listo/);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith("/media-library/files/790"));
  } finally {
    global.fetch = original;
    if (originalToken === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN; else process.env.SOCIAL_INBOX_API_TOKEN = originalToken;
  }
});

test("La reactivación de Super Bot es una acción explícita de Messenger y valida la conversación", async () => {
  const original = global.fetch;
  const originalToken = process.env.SOCIAL_INBOX_API_TOKEN;
  process.env.SOCIAL_INBOX_API_TOKEN = "test-secret";
  const calls: { url: string; body?: string; headers?: HeadersInit }[] = [];
  try {
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), body: options?.body as string | undefined, headers: options?.headers });
      if (String(url).endsWith("/enable-bot")) return Response.json({ success: true });
      return Response.json({
        data: {
          id: "123",
          botEnabled: false,
          contactInboxes: [{ id: "contact-inbox", inboxId: "messenger-inbox", channel: "messenger", lastIncomingMessageAt: null, inbox: { name: "Messenger" } }],
        },
      });
    };

    await enableSocialBot("messenger", "123", "enable-request");

    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.endsWith("/conversations/123"));
    assert.ok(calls[1].url.endsWith("/conversations/123/enable-bot"));
    assert.deepEqual(JSON.parse(calls[1].body!), {});
    assert.equal((calls[1].headers as Record<string, string>)["Idempotency-Key"], "enable-request");

    await assert.rejects(enableSocialBot("tiktok", "123", "enable-other"), /solo está disponible para Messenger/);
    assert.equal(calls.length, 2, "un canal fuera de alcance no debe mutar el proveedor");
  } finally {
    global.fetch = original;
    if (originalToken === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN; else process.env.SOCIAL_INBOX_API_TOKEN = originalToken;
  }
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

test("Private ChatbotX attachment URLs use the authenticated store proxy", () => {
  const message = safeSocialMessage({
    id: "message-42", text: null, createdAt: "2026-11-04T20:00:00Z", contactInboxId: "inbox-1", messageType: "incoming", deletedAt: null, sendError: null,
    attachments: [
      { id: "filesystem-image", name: "foto.jpg", fileType: "image", mimeType: "image/jpeg", url: "http://filesystem:9000/workspace/foto.jpg?signature=private" },
      { id: "provider-path", name: "foto-2.jpg", fileType: "image", mimeType: "image/jpeg", url: "/media/workspace/foto-2.jpg" },
      { id: "origin-path", name: "foto-enviada.jpg", fileType: "image", mimeType: "image/jpeg", url: null, originPath: "workspace/foto-enviada.jpg" },
      { id: "public-image", name: "foto-3.jpg", fileType: "image", mimeType: "image/jpeg", url: "https://cdn.example.test/foto-3.jpg?signature=public" },
      { id: "other-http", name: "no.jpg", fileType: "image", mimeType: "image/jpeg", url: "http://untrusted.example.test/no.jpg" },
    ],
  }, { channel: "messenger", conversationId: "123" });
  const [filesystem, providerPath, originPath, publicImage, otherHttp] = message.attachments!;
  const proxyPrefix = "/api/admin/social/messenger/attachments/123/message-42/";
  assert.equal(filesystem.url, `${proxyPrefix}filesystem-image`);
  assert.equal(providerPath.url, `${proxyPrefix}provider-path`);
  assert.equal(originPath.url, `${proxyPrefix}origin-path`);
  assert.equal(publicImage.url, "https://cdn.example.test/foto-3.jpg?signature=public");
  assert.equal(otherHttp.url, null);
  assert.equal(JSON.stringify(message).includes("filesystem:9000"), false);
  assert.equal(JSON.stringify(message).includes("signature=private"), false);
  assert.equal(JSON.stringify(message).includes("workspace/foto-enviada.jpg"), false);
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
      safeSocialMessage({ id: "api-row", sourceId: "provider-message", senderType: "api", createdAt: "2026-10-10T20:55:39.749Z" } as SocialMessage),
      safeSocialMessage({ id: "echo-row", sourceId: "provider-message", senderType: "user", createdAt: "2026-10-10T20:55:41Z" } as SocialMessage),
    ]);
    assert.deepEqual(messages.map(message => message.id), ["echo-row"]);
    assert.equal(messages[0].sourceId, "provider-message");
    assert.equal(messages[0].senderType, "user");

    const missingSourceId = dedupeSocialMessages([
      {
        id: "api-ack", sourceId: null, senderType: "api", contactInboxId: "inbox-1", messageType: "outgoing",
        text: "si es compatible", createdAt: "2026-11-03T17:41:55.000Z", deletedAt: null, sendError: null,
      },
      {
        id: "webhook-echo", sourceId: null, senderType: "user", contactInboxId: "inbox-1", messageType: "outgoing",
        text: "si es compatible", createdAt: "2026-11-03T17:41:57.000Z", deletedAt: null, sendError: null,
      },
    ]);
    assert.deepEqual(missingSourceId.map(message => message.id), ["webhook-echo"]);

    const repeatedCustomerMessages = dedupeSocialMessages([
      {
        id: "customer-one", sourceId: null, senderType: "user", contactInboxId: "inbox-1", messageType: "incoming",
        text: "si es compatible", createdAt: "2026-11-03T17:41:55.000Z", deletedAt: null, sendError: null,
      },
      {
        id: "customer-two", sourceId: null, senderType: "user", contactInboxId: "inbox-1", messageType: "incoming",
        text: "si es compatible", createdAt: "2026-11-03T17:41:57.000Z", deletedAt: null, sendError: null,
      },
    ]);
    assert.deepEqual(repeatedCustomerMessages.map(message => message.id), ["customer-one", "customer-two"]);
  } finally {
    global.fetch = original;
    if (originalToken === undefined) delete process.env.SOCIAL_INBOX_API_TOKEN;
    else process.env.SOCIAL_INBOX_API_TOKEN = originalToken;
  }
});

test("Provider handover notices stay out of reply bubbles", () => {
  const safe = safeSocialMessage({
    id: "handover", text: "You took over this chat from your AI agent.", createdAt: "2026-10-10T20:00:00Z",
    contactInboxId: "1", messageType: "outgoing", deletedAt: null, sendError: null,
  });
  assert.equal(safe.text, null);
  assert.equal(safe.systemEvent, "provider_handover");
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
