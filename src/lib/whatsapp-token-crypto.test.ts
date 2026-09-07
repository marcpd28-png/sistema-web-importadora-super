import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptWhatsappToken, encryptWhatsappToken } from "./whatsapp-token-crypto";

test("cifra y descifra tokens WhatsApp con AES-256-GCM", () => {
  const previous = process.env.META_TOKEN_ENCRYPTION_KEY;
  process.env.META_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  try {
    const encrypted = encryptWhatsappToken("token-local-de-prueba");
    assert.match(encrypted, /^v1:[^:]+:[^:]+:[^:]+$/);
    assert.equal(decryptWhatsappToken(encrypted), "token-local-de-prueba");
    assert.notEqual(encrypted, encryptWhatsappToken("token-local-de-prueba"));
  } finally {
    if (previous === undefined) delete process.env.META_TOKEN_ENCRYPTION_KEY;
    else process.env.META_TOKEN_ENCRYPTION_KEY = previous;
  }
});

test("rechaza una clave de cifrado con longitud incorrecta", () => {
  const previous = process.env.META_TOKEN_ENCRYPTION_KEY;
  process.env.META_TOKEN_ENCRYPTION_KEY = "invalid";

  try {
    assert.throws(() => encryptWhatsappToken("token"), /64 caracteres/);
  } finally {
    if (previous === undefined) delete process.env.META_TOKEN_ENCRYPTION_KEY;
    else process.env.META_TOKEN_ENCRYPTION_KEY = previous;
  }
});
