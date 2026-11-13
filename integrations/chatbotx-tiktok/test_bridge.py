import importlib.util
import os
import sys
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location("tiktok_bridge", os.path.join(os.path.dirname(__file__), "bridge.py"))
bridge_module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = bridge_module
SPEC.loader.exec_module(bridge_module)


class FakeChatbot:
    def __init__(self):
        self.messages = [
            {"id": "m1", "sourceId": "source-1", "contactInboxId": "contact-1", "senderType": "contact", "messageType": "incoming", "text": "Hola", "createdAt": "2026-11-05T12:00:00Z", "attachments": []},
            {"id": "m2", "sourceId": "source-2", "contactInboxId": "contact-1", "senderType": "contact", "messageType": "incoming", "text": "Busco cargadores", "createdAt": "2026-11-05T12:00:01Z", "attachments": []},
        ]
        self.sent = []
        self.uploaded = []
        self.handoffs = []
        self.bot_enabled = True
        self.channel = bridge_module.CHANNEL

    def list_conversations(self):
        return [{"id": "123", "botEnabled": self.bot_enabled, "contactInboxes": [{"id": "contact-1", "inboxId": "inbox-1", "channel": self.channel}]}]

    def list_messages(self, _conversation_id):
        return list(self.messages)

    def send_text(self, conversation_id, inbox_id, text, key):
        self.sent.append(("text", conversation_id, inbox_id, text, key))

    def send_media(self, conversation_id, inbox_id, media_id, key):
        self.sent.append(("media", conversation_id, inbox_id, media_id, key))

    def upload_public_file(self, url, _name, _mime):
        self.uploaded.append(url)
        return "media-" + url.rsplit("/", 1)[-1]

    def disable_bot(self, conversation_id, key):
        self.handoffs.append((conversation_id, key))
        self.bot_enabled = False


class FakeSuperBot:
    def __init__(self, reply):
        self.reply_value = reply
        self.calls = []
        self.responses = []

    def reply(self, payload):
        self.calls.append(payload)
        if self.responses:
            return self.responses.pop(0)
        return 200, {}, {"reply": self.reply_value}


class BridgeTests(unittest.TestCase):
    def setUp(self):
        # 2026-11-05T12:00:01Z, immediately after the fixture's last turn.
        self.clock = [1793880001.0]
        self.temp = tempfile.TemporaryDirectory()
        self.chatbot = FakeChatbot()
        self.superbot = FakeSuperBot({"text": "Estas son las opciones", "products": []})
        self.config = bridge_module.Config(True, os.path.join(self.temp.name, "bridge.db"), "https://chatbot.test/api", "token", "https://store.test/reply", "key", "x" * 32, silence_seconds=3)
        self.bridge = bridge_module.Bridge(self.config, self.chatbot, self.superbot, now=lambda: self.clock[0])

    def tearDown(self):
        self.bridge.close()
        self.temp.cleanup()

    def test_batches_customer_messages_once_and_preserves_first_contact(self):
        self.bridge.poll_once()
        self.assertEqual(self.superbot.calls, [])
        self.clock[0] += 4
        self.bridge.process_due()
        self.assertEqual(len(self.superbot.calls), 1)
        payload = self.superbot.calls[0]
        self.assertEqual(payload["channel"], "tiktok")
        self.assertEqual(payload["message"], "Hola\nBusco cargadores")
        self.assertTrue(payload["isFirstContact"])
        self.assertEqual([row[0] for row in self.chatbot.sent], ["text"])
        self.bridge.process_due()
        self.assertEqual(len(self.superbot.calls), 1, "la entrega repetida no debe llamar al modelo")

    def test_typing_lease_defers_model_call_then_expires(self):
        self.bridge.poll_once()
        self.bridge.set_typing("123", True, 8)
        self.clock[0] += 4
        self.bridge.process_due()
        self.assertEqual(self.superbot.calls, [])
        self.clock[0] += 8
        self.bridge.process_due()
        self.assertEqual(len(self.superbot.calls), 1)

    def test_visual_reply_sends_photos_then_a_single_short_closing_question(self):
        self.superbot.reply_value = {
            "text": "Texto de catálogo que no debe repetirse debajo de fotos.",
            "products": [
                {"code": "A1", "telegramImageUrl": "/api/telegram/product-image/A1"},
                {"code": "A2", "telegramImageUrl": "/api/telegram/product-image/A2"},
            ],
        }
        self.bridge.poll_once()
        self.clock[0] += 4
        self.bridge.process_due()
        self.assertEqual([row[0] for row in self.chatbot.sent], ["media", "media", "text"])
        self.assertEqual(self.chatbot.sent[-1][3], "¿Cuál de estas opciones te interesa?")
        self.assertEqual(self.chatbot.uploaded, [
            "https://tiendavirtualsuper.com/api/telegram/product-image/A1",
            "https://tiendavirtualsuper.com/api/telegram/product-image/A2",
        ])

    def test_newer_turn_waits_for_silence_and_is_not_lost_with_the_older_turn(self):
        self.chatbot.messages = [
            {"id": "old", "sourceId": "old", "contactInboxId": "contact-1", "senderType": "contact", "messageType": "incoming", "text": "Primero", "createdAt": self.clock[0] - 4, "attachments": []},
            {"id": "new", "sourceId": "new", "contactInboxId": "contact-1", "senderType": "contact", "messageType": "incoming", "text": "Luego", "createdAt": self.clock[0] - 1, "attachments": []},
        ]
        self.bridge.poll_once()
        self.assertEqual(self.superbot.calls, [], "un turno reciente debe retrasar todo el grupo")
        self.clock[0] += 3
        self.bridge.process_due()
        self.assertEqual(len(self.superbot.calls), 1)
        self.assertEqual(self.superbot.calls[0]["message"], "Primero\nLuego")
        states = self.bridge.db.execute("SELECT message_id,state FROM inbound_events ORDER BY created").fetchall()
        self.assertEqual(states, [("old", "delivered"), ("new", "delivered")])

    def test_retry_respects_retry_after_and_reuses_the_same_event_id(self):
        self.superbot.responses = [
            (503, {"Retry-After": "10"}, {"error": "temporal"}),
            (200, {}, {"reply": {"text": "Listo", "products": []}}),
        ]
        self.bridge.poll_once()
        self.clock[0] += 4
        self.bridge.process_due()
        self.assertEqual(len(self.superbot.calls), 1)
        first_event = self.superbot.calls[0]["eventId"]
        self.clock[0] += 9
        self.bridge.process_due()
        self.assertEqual(len(self.superbot.calls), 1, "no se debe ignorar Retry-After")
        self.clock[0] += 1
        self.bridge.process_due()
        self.assertEqual(len(self.superbot.calls), 2)
        self.assertEqual(self.superbot.calls[1]["eventId"], first_event)

    def test_durable_handoff_pauses_queued_work_but_typing_leases_do_not(self):
        self.bridge.poll_once()
        self.chatbot.bot_enabled = False
        self.bridge.poll_once()
        self.clock[0] += 10
        self.bridge.process_due()
        self.assertEqual(self.superbot.calls, [])
        states = self.bridge.db.execute("SELECT DISTINCT state FROM inbound_events").fetchall()
        self.assertEqual(states, [("paused",)])

    def test_unresolved_reply_pauses_the_provider_without_sending_a_fallback(self):
        self.superbot.reply_value = {
            "text": "",
            "products": [],
            "meta": {"requiresAdvisor": True},
        }
        self.bridge.poll_once()
        self.clock[0] += 4
        self.bridge.process_due()

        self.assertEqual(self.chatbot.sent, [])
        self.assertEqual(len(self.chatbot.handoffs), 1)
        self.assertFalse(self.chatbot.bot_enabled)
        self.assertEqual(self.bridge.db.execute("SELECT state FROM batches").fetchone()[0], "paused")

    def test_invalid_catalog_bundle_never_delivers_only_the_small_parts(self):
        self.superbot.reply_value = {
            "text": "Aquí está tu catálogo.",
            "products": [],
            "documents": [
                {"url": "https://tiendavirtualsuper.com/uploads/catalogs/parte-1.pdf", "sizeBytes": 1024},
                {"url": "https://tiendavirtualsuper.com/uploads/catalogs/parte-2.pdf", "sizeBytes": bridge_module.MAX_MEDIA_BYTES + 1},
            ],
        }
        self.bridge.poll_once()
        self.clock[0] += 4
        self.bridge.process_due()
        self.assertEqual([row[0] for row in self.chatbot.sent], ["text"])
        self.assertIn("límite de archivo de TikTok", self.chatbot.sent[-1][3])

    def test_disabled_bridge_observes_without_enqueuing_or_sending(self):
        config = bridge_module.Config(False, os.path.join(self.temp.name, "disabled.db"), "https://chatbot.test/api", "token", "", "", "x" * 32, silence_seconds=3)
        disabled = bridge_module.Bridge(config, self.chatbot, self.superbot, now=lambda: self.clock[0])
        try:
            # poll_once deliberately requires no credentials while disabled.
            disabled.poll_once()
            self.clock[0] += 10
            disabled.process_due()
            self.assertEqual(self.superbot.calls, [])
        finally:
            disabled.close()

    def test_messenger_instance_uses_its_own_event_scope(self):
        original_channel = bridge_module.CHANNEL
        bridge_module.CHANNEL = "messenger"
        self.chatbot.channel = "messenger"
        try:
            self.bridge.poll_once()
            self.clock[0] += 4
            self.bridge.process_due()
            self.assertEqual(self.superbot.calls[0]["channel"], "messenger")
            self.assertTrue(self.superbot.calls[0]["eventId"].startswith("messenger:123:"))
            self.assertEqual([row[0] for row in self.chatbot.sent], ["text"])
        finally:
            bridge_module.CHANNEL = original_channel

    def test_attachment_only_message_preserves_empty_customer_text(self):
        self.chatbot.messages = [{
            "id": "image-only", "sourceId": "image-only", "contactInboxId": "contact-1",
            "senderType": "contact", "messageType": "incoming", "text": "",
            "createdAt": "2026-11-05T12:00:00Z", "attachments": [{"id": "attachment-1"}],
        }]
        self.bridge.poll_once()
        self.clock[0] += 4
        self.bridge.process_due()
        payload = self.superbot.calls[0]
        self.assertEqual(payload["message"], "")
        self.assertTrue(payload["hasAttachments"])
        self.assertEqual(payload["attachmentCount"], 1)


if __name__ == "__main__":
    unittest.main()
