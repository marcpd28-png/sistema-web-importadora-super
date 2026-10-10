"""Focused regression tests for the Messenger ownership fallback."""
import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("service.py")
SPEC = importlib.util.spec_from_file_location("messenger_control", MODULE_PATH)
service = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(service)


class ProviderOwnerFallbackTests(unittest.TestCase):
    def test_unsupported_owner_lookup_does_not_block_take_control(self):
        provider = service.Provider("internal-token")
        requests = []

        def request(url, _token, data=None, allow_owner_lookup_fallback=False):
            requests.append((url, data, allow_owner_lookup_fallback))
            if "thread_owner" in url:
                self.assertTrue(allow_owner_lookup_fallback)
                return None
            return {"success": True}

        provider.request = request
        context = {"recipient": "123", "auth": {"version": "v25.0", "tokens": {"accessToken": "page-token"}}}
        provider.graph(context, "take")

        self.assertTrue(any(url.endswith("/me/take_thread_control") for url, _, _ in requests))
        self.assertTrue(all(not url.endswith("/extend_thread_control") for url, _, _ in requests))

    def test_owner_state_is_marked_unverified_when_graph_hides_it(self):
        provider = service.Provider("internal-token")
        provider.request = lambda *_args, **_kwargs: None
        context = {"recipient": "123", "auth": {"version": "v25.0", "tokens": {"accessToken": "page-token"}}}

        self.assertEqual(provider.graph(context, "owner"), {
            "owner": "unknown", "expiresAt": None, "ownerVerified": False,
        })

    def test_taking_an_already_owned_thread_is_a_safe_noop(self):
        provider = service.Provider("internal-token")
        requests = []

        def request(url, _token, data=None, allow_owner_lookup_fallback=False):
            requests.append((url, data, allow_owner_lookup_fallback))
            if "thread_owner" in url:
                return {"data": [{"thread_owner": {"app_id": service.APP}}]}
            self.fail("No ownership mutation is needed when the store already controls the thread.")

        provider.request = request
        context = {"recipient": "123", "auth": {"version": "v25.0", "tokens": {"accessToken": "page-token"}}}
        provider.graph(context, "take")

        self.assertEqual(len(requests), 1)
        self.assertTrue(requests[0][0].endswith("/me/thread_owner?recipient=123"))

    def test_meta_activation_passes_directly_when_the_store_already_owns_the_thread(self):
        provider = service.Provider("internal-token")
        requests = []
        passed_to_meta = False

        def request(url, _token, data=None, allow_owner_lookup_fallback=False):
            nonlocal passed_to_meta
            requests.append((url, data, allow_owner_lookup_fallback))
            if "thread_owner" in url:
                owner = service.META_AI_APP if passed_to_meta else service.APP
                return {"data": [{"thread_owner": {"app_id": owner}}]}
            if url.endswith("/pass_thread_control"):
                passed_to_meta = True
                return {"success": True}
            self.fail("Taking control again is unnecessary before passing it to Meta.")

        provider.request = request
        context = {"recipient": "123", "auth": {"version": "v25.0", "tokens": {"accessToken": "page-token"}}}
        provider.graph(context, "meta")

        self.assertTrue(any(url.endswith("/me/pass_thread_control") for url, _, _ in requests))
        self.assertFalse(any(url.endswith("/me/take_thread_control") for url, _, _ in requests))


if __name__ == "__main__":
    unittest.main()
