import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseAdvisorSocialChannel } from "./advisor-social-channel";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("el perfil de asesor muestra Telegram, Messenger y TikTok, nunca WhatsApp", () => {
  const navigation = read("../components/advisor/advisor-message-channel-nav.tsx");
  const telegramPage = read("../app/asesor/mensajes/page.tsx");
  const workspace = read("../components/admin/messages/MessagesWorkspace.tsx");

  for (const channel of ["Telegram", "Messenger", "TikTok"]) assert.match(navigation, new RegExp(channel));
  assert.doesNotMatch(navigation, /WhatsApp/);
  assert.match(telegramPage, /initialChannel="TELEGRAM"/);
  assert.match(telegramPage, /showChannelFilter=\{false\}/);
  assert.match(workspace, /showChannelFilter/);
});

test("el centro de mensajes no ofrece un filtro de WhatsApp", () => {
  const conversationList = read("../components/admin/messages/ConversationList.tsx");

  assert.match(conversationList, /\['', 'Todos'\]/);
  assert.match(conversationList, /\['TELEGRAM', 'Telegram'\]/);
  assert.doesNotMatch(conversationList, /\['WHATSAPP', 'WhatsApp'\]/);
});

test("Messenger y TikTok del asesor usan endpoints limitados y sin controles administrativos", () => {
  const messengerPage = read("../app/asesor/mensajes/messenger/page.tsx");
  const tiktokPage = read("../app/asesor/mensajes/tiktok/page.tsx");
  const socialRoute = read("../app/api/asesor/mensajes/social/[channel]/route.ts");
  const uploadRoute = read("../app/api/asesor/mensajes/social/[channel]/uploads/route.ts");
  const socialInbox = read("../components/admin/messages/SocialInbox.tsx");

  for (const page of [messengerPage, tiktokPage]) {
    assert.match(page, /apiBase="\/api\/asesor\/mensajes\/social"/);
    assert.match(page, /canManageBot=\{false\}/);
    assert.match(page, /canManageConnection=\{false\}/);
  }
  assert.match(socialRoute, /getMessageCenterSession/);
  assert.match(socialRoute, /session\?\.role === "ASESOR"/);
  assert.match(socialRoute, /parseAdvisorSocialChannel/);
  assert.match(uploadRoute, /session\?\.role === "ASESOR"/);
  assert.match(uploadRoute, /parseAdvisorSocialChannel/);
  assert.match(socialInbox, /canManageBot && channel === "messenger"/);
});

test("los endpoints sociales del asesor rechazan cualquier canal fuera de Messenger y TikTok", () => {
  assert.equal(parseAdvisorSocialChannel("messenger"), "messenger");
  assert.equal(parseAdvisorSocialChannel("tiktok"), "tiktok");
  for (const channel of ["instagram", "telegram", "whatsapp", ""]) {
    assert.throws(() => parseAdvisorSocialChannel(channel));
  }
});
