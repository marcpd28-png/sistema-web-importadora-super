import assert from 'node:assert/strict';
import test from 'node:test';
import { trackStoreEvent, clearStoreAnalyticsSession } from './store-analytics-client';
import { ANALYTICS_CONSENT_KEY } from './clarity';
test('native tracking waits for consent, reuses session and excludes private routes', async () => {
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  const sent: Array<{sessionId: string; events: Array<{name: string; searchTerm?: string}>}> = [];
  const location = { pathname: '/', href: 'https://tienda.test/', origin: 'https://tienda.test' };
  try {
    Object.assign(globalThis, { window: { storeAnalyticsActive: true, location, innerWidth: 400 }, document: { referrer: '' }, localStorage: storage, sessionStorage: storage, fetch: async (_url: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response(null, { status: 204 }); } });
    trackStoreEvent('page_view'); assert.equal(sent.length, 0);
    storage.setItem(ANALYTICS_CONSENT_KEY, 'accepted');
    trackStoreEvent('page_view'); trackStoreEvent('page_view'); assert.equal(sent.length, 1);
    trackStoreEvent('search', { searchTerm: 'ana@example.com' });
    assert.equal(sent[1].events[0].searchTerm, ''); assert.equal(sent[0].sessionId, sent[1].sessionId);
    location.pathname = '/admin'; trackStoreEvent('page_view'); assert.equal(sent.length, 2);
    location.pathname = '/'; clearStoreAnalyticsSession(); trackStoreEvent('page_view'); assert.notEqual(sent[2].sessionId, sent[0].sessionId);
    storage.setItem(ANALYTICS_CONSENT_KEY, 'rejected'); trackStoreEvent('search'); assert.equal(sent.length, 3);
  } finally {
    clearStoreAnalyticsSession();
    for (const key of ['window', 'document', 'localStorage', 'sessionStorage', 'fetch']) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
