import assert from "node:assert/strict";
import test from "node:test";
import { canManageMessaging, canUseMessageCenter, MESSAGING_OWNER_EMAIL } from "./auth";

const messagingOwner = {
  email: "mark@importadora.local",
  role: "ADMIN" as const,
  requirePasswordChange: false,
};

test("permite mensajería únicamente al propietario normalizado", () => {
  assert.equal(MESSAGING_OWNER_EMAIL, "mark@importadora.local");
  assert.equal(canManageMessaging(messagingOwner), true);
  assert.equal(canManageMessaging({ ...messagingOwner, email: " MARK@IMPORTADORA.LOCAL " }), true);
});

test("niega mensajería a otros administradores, roles y sesiones pendientes", () => {
  assert.equal(canManageMessaging(null), false);
  assert.equal(canManageMessaging({ ...messagingOwner, email: "adminmark@importadora.com" }), false);
  assert.equal(canManageMessaging({ ...messagingOwner, role: "USERSHOP" }), false);
  assert.equal(canManageMessaging({ ...messagingOwner, requirePasswordChange: true }), false);
});

test("habilita la bandeja para asesores sin otorgar controles de propietario", () => {
  const advisor = { email: "asesor@importadora.com", role: "ASESOR" as const, requirePasswordChange: false };

  assert.equal(canUseMessageCenter(messagingOwner), true);
  assert.equal(canUseMessageCenter(advisor), true);
  assert.equal(canManageMessaging(advisor), false);
  assert.equal(canUseMessageCenter({ ...advisor, requirePasswordChange: true }), false);
  assert.equal(canUseMessageCenter({ ...advisor, role: "USERSHOP" }), false);
});
