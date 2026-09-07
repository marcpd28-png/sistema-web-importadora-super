# Meta WhatsApp local integration

This local implementation covers Facebook Login for Business / WhatsApp Embedded Signup and the admin Message Center only. It does not change checkout, payments, promotions, orders, catalog, or the legacy ManyChat quote flow.

## Credential resolution

Message Center sends resolve credentials in this order:

1. An `ACTIVE` `WhatsappIntegration` row in PostgreSQL.
2. Temporary fallback to `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.

ManyChat is intentionally not part of this resolver. Existing ManyChat code remains available to its previous callers.

## Encryption

`META_TOKEN_ENCRYPTION_KEY` must be exactly 64 hexadecimal characters, representing 32 bytes. Generate a local key with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Tokens are stored as `v1:base64(iv):base64(authTag):base64(ciphertext)` using AES-256-GCM. The key, token, authorization code, and app secret are never returned by an API or written to logs. If the key is missing or invalid, Embedded Signup refuses to persist a token with a sanitized configuration error; the temporary environment fallback remains available for local Message Center testing.

## Meta configuration

Configure the Meta app ID, Login for Business configuration ID, app secret, Graph version, and encryption key in the local environment only. The browser receives only `NEXT_PUBLIC_META_APP_ID` and `NEXT_PUBLIC_META_LOGIN_CONFIG_ID`. The server exchanges the authorization code and verifies the WABA, phone number, and subscribed apps using read-only Graph requests.

The verification card deliberately reports `Envío real: NO PROBADO`. Reading Graph resources is not proof that an outbound message can be delivered. No automatic test message, number registration, deregistration, migration, PIN, display-name, or 2FA operation is performed.

## Embedded Signup state and replay

This implementation uses the Facebook JavaScript SDK `FB.login` popup with `response_type: "code"`, rather than a separate redirect callback. The Embedded Signup sample flow correlates the short-lived authorization code with the `WA_EMBEDDED_SIGNUP` `postMessage` session information; it does not require adding an OAuth `state` parameter to the supported `FB.login` options. The backend endpoint is protected by `requireAdmin`, the code is exchanged server-side, and Meta treats the authorization code as short-lived and single-use. We therefore do not invent an unsupported `state` parameter. The browser only exchanges when both the SDK code and a validated signup message are present, and the server verifies all WABA and phone identifiers before persisting anything.

## Local disconnect

`POST /api/admin/integrations/whatsapp/disconnect` deletes only the selected `WhatsappIntegration` row from PostgreSQL. It does not call Meta, deregister a number, remove subscriptions, modify a WABA, modify a phone number, or touch ManyChat. Reconnecting the same Business/WABA/Phone tuple uses the composite unique key and updates the existing local row.

If Embedded Signup returns `business_id` and `waba_id` without `phone_number_id`, the server reads the WABA phone list. Exactly one authorized phone is resolved; zero phones returns an error state; multiple phones returns `PHONE_SELECTION_REQUIRED` with no arbitrary selection.

## Webhooks

The current webhook route remains unchanged when its secret is absent. The admin diagnostics expose whether a webhook signature secret is configured, but this local change does not alter production webhook behavior.
