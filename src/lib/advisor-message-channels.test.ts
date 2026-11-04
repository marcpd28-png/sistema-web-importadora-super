import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseAdvisorSocialChannel } from "./advisor-social-channel";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("el centro de asesor separa Telegram de las bandejas sociales activas", () => {
  const navigation = read("../components/advisor/advisor-message-channel-nav.tsx");
  const telegramPage = read("../app/asesor/mensajes/page.tsx");
  const layout = read("../app/asesor/mensajes/layout.tsx");

  for (const channel of ["Telegram", "Messenger", "TikTok"]) {
    assert.match(navigation, new RegExp(channel));
  }
  assert.doesNotMatch(navigation, /WhatsApp/);
  assert.match(telegramPage, /initialChannel="TELEGRAM"/);
  assert.match(layout, /AdvisorMessageChannelNav/);
});

test("Messenger y TikTok del asesor usan rutas limitadas y no exponen controles de propietario", () => {
  const messengerPage = read("../app/asesor/mensajes/messenger/page.tsx");
  const tiktokPage = read("../app/asesor/mensajes/tiktok/page.tsx");
  const socialRoute = read("../app/api/asesor/mensajes/social/[channel]/route.ts");
  const uploadRoute = read("../app/api/asesor/mensajes/social/[channel]/uploads/route.ts");
  const inbox = read("../components/admin/messages/SocialInbox.tsx");

  for (const page of [messengerPage, tiktokPage]) {
    assert.match(page, /apiBase="\/api\/asesor\/mensajes\/social"/);
    assert.match(page, /canManageBot=\{false\}/);
    assert.match(page, /canManageConnection=\{false\}/);
  }
  assert.match(socialRoute, /getMessageCenterSession/);
  assert.match(socialRoute, /session\?\.role === "ASESOR"/);
  assert.match(socialRoute, /parseAdvisorSocialChannel/);
  assert.match(socialRoute, /sendSocialReply/);
  assert.doesNotMatch(socialRoute, /export async function PATCH/);
  assert.match(uploadRoute, /session\?\.role === "ASESOR"/);
  assert.match(uploadRoute, /parseAdvisorSocialChannel/);
  assert.match(inbox, /canManageBot && channel === "messenger"/);
  assert.match(inbox, /canManageConnection && authorizationUrl/);
});

test("las rutas sociales del asesor sólo admiten Messenger y TikTok", () => {
  assert.equal(parseAdvisorSocialChannel("messenger"), "messenger");
  assert.equal(parseAdvisorSocialChannel("tiktok"), "tiktok");
  for (const channel of ["telegram", "whatsapp", "instagram", ""]) {
    assert.throws(() => parseAdvisorSocialChannel(channel));
  }
});
