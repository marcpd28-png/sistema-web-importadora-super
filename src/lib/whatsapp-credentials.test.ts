import assert from "node:assert/strict";
import { test } from "node:test";
import { selectWhatsappCredentials } from "./whatsapp-credentials";
import { encryptWhatsappToken } from "./whatsapp-token-crypto";

test("prioriza la integración activa sobre el fallback de entorno", () => {
  const previous = process.env.META_TOKEN_ENCRYPTION_KEY;
  process.env.META_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  try {
    const result = selectWhatsappCredentials(
      { id: "integration-1", phoneNumberId: "phone-db", accessTokenEncrypted: encryptWhatsappToken("token-db") },
      { accessToken: "token-env", phoneNumberId: "phone-env" },
    );
    assert.deepEqual(result, { accessToken: "token-db", phoneNumberId: "phone-db", source: "database/oauth", integrationId: "integration-1" });
  } finally {
    if (previous === undefined) delete process.env.META_TOKEN_ENCRYPTION_KEY;
    else process.env.META_TOKEN_ENCRYPTION_KEY = previous;
  }
});

test("usa el fallback temporal cuando no hay integración guardada", () => {
  assert.deepEqual(
    selectWhatsappCredentials(null, { accessToken: "token-env", phoneNumberId: "phone-env" }),
    { accessToken: "token-env", phoneNumberId: "phone-env", source: "env", integrationId: null },
  );
});
