# Telegram in the store inbox

The `/admin/mensajes/telegram` page uses the existing store admin session. Agents do not log into Telegram or ChatbotX. It manages the private chats of the connected `@Superimportaciones` account; every automatic reply must be requested from Super Bot through the bridge adapter.

## Components

- Store: `TELEGRAM` channel, persisted conversation routing and last inbound timestamp, `/api/telegram/events` authenticated intake, manual replies through the private bridge, authenticated media proxy.
- Bridge: `inbox.py` plus `bridge.patch` against the bridge service's `app.py`. Its adapter must request automated catalog and order replies from Super Bot at `/api/internal/super-bot/reply`; transport, retention and forwarding remain in the bridge. The module is mounted read-only at `/app/inbox.py`.
- The private bridge API remains on `127.0.0.1:13124`. Do not expose its `/inbox/` paths in public Nginx.

Store environment: `TELEGRAM_BRIDGE_URL=http://127.0.0.1:13124`, `TELEGRAM_BRIDGE_SECRET` (random secret of at least 32 characters) and `SUPER_BOT_INTERNAL_API_KEY`. Bridge config: `inbox_secret` with the same value, `inbox_url=https://tiendavirtualsuper.com/api/telegram/events`, `super_bot_url=https://tiendavirtualsuper.com/api/internal/super-bot/reply` and `super_bot_key` with the same `SUPER_BOT_INTERNAL_API_KEY`. Never put the bot token or Super Bot key in the browser or source control.

When the inbox adapter is installed it claims each private customer message before the legacy bridge logic. It queues one Super Bot request and sends the resulting reply only if no advisor has paused the conversation. If the Super Bot URL/key is missing, unavailable, or returns an invalid reply, the bridge sends nothing and never falls back to another bot.

The bridge saves inbound/outbound events to `data/store-inbox.sqlite` and retries store synchronization in order. Agent commands use durable request IDs. Ambiguous Telegram sends are marked uncertain and are never automatically sent again. A manual reply pauses the bridge before delivery; explicit activation in the inbox resumes it. Edits and Telegram deletions are reflected while preserving the stored message copy. Replies require an active authorized connection and a customer message within the preceding 24 hours.

Telegram documents above 25 MB use a direct authenticated download rather than loading the complete file into the chat preview. The media proxy limits the wait for response headers but allows large downloads to finish streaming.

`export_history.py` is a one-time, read-only importer for up to 50 recent messages in each already-linked private chat. It uses the existing authorized retention account in memory and does not change Telegram or send messages. Historical imports are marked `historical` to avoid creating unread counts or triggering automation. Future messages use the business webhook, not this account session.

## Validation

- `python integrations/telegram/test_inbox.py`: private authorization, durable intake, replay protection, expired reply windows, human control, supported media and ambiguous deliveries. Set `TELEGRAM_BRIDGE_SOURCE=/ruta/al/bridge` to include the real adapter pause/resume integration.
- `node --import tsx --test src/lib/telegram-bridge.test.ts`: authentication and window boundaries.
- `src/lib/telegram-inbox.integration.test.ts` requires a disposable localhost PostgreSQL schema named `telegram_inbox_test_20261009`; never run it against production tables. Exercises storage concurrency, actual store services, mocked bridge HTTP, edits/deletions and control revisions.
- Existing bridge tests must pass on Linux. Some older tests leave SQLite files open and cannot clean their temporary folders on Windows.

## Deployment and rollback

Build in an isolated release directory, apply the additive Prisma migration, install the verified build and source, then enable bridge synchronization. Back up the prior build, touched source, environment and bridge configuration first. Restart only the store and bridge processes. For rollback restore the build and code/configuration; keep the database additions and live SQLite files so newly received messages and orders are not lost.
